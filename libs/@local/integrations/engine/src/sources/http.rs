use alloc::{collections::BTreeMap, sync::Arc};
use core::{net::IpAddr, time::Duration};
use std::sync::{Mutex, OnceLock};

use error_stack::Report;
use reqwest::{Client, Url};
use tokio::time::Instant;

use super::SourceError;

pub(super) fn client() -> Result<Client, Report<SourceError>> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .dns_resolver(Arc::new(PublicResolver))
        .build()
        .map_err(|_error| Report::new(SourceError::Request))
}

struct PublicResolver;

impl reqwest::dns::Resolve for PublicResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        Box::pin(async move {
            let addresses: Vec<_> = tokio::net::lookup_host((name.as_str(), 0)).await?.collect();
            if addresses.is_empty() || addresses.iter().any(|address| !public(address.ip())) {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "destination is not exclusively public",
                )
                .into());
            }
            Ok(Box::new(addresses.into_iter()) as reqwest::dns::Addrs)
        })
    }
}

fn public(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => address.is_global() && !address.is_multicast(),
        IpAddr::V6(address) => address.to_ipv4_mapped().map_or_else(
            || address.is_global() && !address.is_multicast(),
            |address| address.is_global() && !address.is_multicast(),
        ),
    }
}

pub(super) fn validate(url: &Url) -> Result<(), Report<SourceError>> {
    if !matches!(url.scheme(), "http" | "https")
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(Report::new(SourceError::Destination));
    }
    let address = match url.host() {
        Some(url::Host::Ipv4(address)) => Some(IpAddr::V4(address)),
        Some(url::Host::Ipv6(address)) => Some(IpAddr::V6(address)),
        _ => None,
    };
    if address.is_some_and(|address| !public(address)) {
        return Err(Report::new(SourceError::Destination));
    }
    Ok(())
}

#[derive(Default)]
struct Pacer(Mutex<BTreeMap<String, (Instant, Duration)>>);

impl Pacer {
    async fn wait(&self, host: &str, interval: Duration) -> Result<(), Report<SourceError>> {
        let slot = {
            let mut slots = self
                .0
                .lock()
                .map_err(|_error| Report::new(SourceError::Request))?;
            let now = Instant::now();
            if slots.len() > 64 {
                slots.retain(|_, (last, _)| {
                    now.saturating_duration_since(*last) < Duration::from_hours(24)
                });
            }
            let slot = match slots.get(host) {
                Some((last, previous)) => last
                    .checked_add(interval.max(*previous))
                    .ok_or_else(|| Report::new(SourceError::Configuration))?
                    .max(now),
                None => now,
            };
            slots.insert(host.to_owned(), (slot, interval));
            slot
        };
        tokio::time::sleep_until(slot).await;
        Ok(())
    }
}

pub(super) async fn fetch(
    client: &Client,
    url: &Url,
    headers: &reqwest::header::HeaderMap,
    interval: Duration,
) -> Result<serde_json::Value, Report<SourceError>> {
    static PACER: OnceLock<Pacer> = OnceLock::new();
    validate(url)?;
    let host = url
        .host_str()
        .ok_or_else(|| Report::new(SourceError::Destination))?;
    for attempt in 0..=10 {
        PACER
            .get_or_init(Pacer::default)
            .wait(host, interval)
            .await?;
        let mut response = client
            .get(url.clone())
            .headers(headers.clone())
            .send()
            .await
            .map_err(|_error| Report::new(SourceError::Request))?;
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS && attempt < 10 {
            let delay = retry_delay(response.headers(), attempt);
            drop(response);
            tokio::time::sleep(delay).await;
            continue;
        }
        if !response.status().is_success() {
            return Err(Report::new(SourceError::Status {
                status: response.status().as_u16(),
            }));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_error| Report::new(SourceError::Response))?
        {
            if bytes.len().saturating_add(chunk.len()) > 16 * 1024 * 1024 {
                return Err(Report::new(SourceError::Response));
            }
            bytes.extend_from_slice(&chunk);
        }
        return serde_json::from_slice(&bytes).map_err(|_error| Report::new(SourceError::Response));
    }
    Err(Report::new(SourceError::Request))
}

fn retry_delay(headers: &reqwest::header::HeaderMap, attempt: u32) -> Duration {
    let milliseconds = headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map_or_else(
            || 500_u64.saturating_mul(1_u64 << attempt.min(16)),
            |seconds| seconds.saturating_mul(1000),
        )
        .min(30_000);
    Duration::from_millis(milliseconds)
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use reqwest::{
        Url,
        header::{HeaderMap, HeaderValue, RETRY_AFTER},
    };

    use super::{Pacer, client, retry_delay, validate};

    #[tokio::test]
    async fn destinations_reject_private_resolution() {
        let guarded = client().expect("should build a guarded client");
        let error = guarded
            .get("http://localhost:9/secret")
            .send()
            .await
            .expect_err("should block private DNS destinations");
        assert!(
            error.is_request() || error.is_connect(),
            "should fail before an HTTP response"
        );
        for address in [
            "http://127.0.0.1",
            "http://[::1]",
            "http://[::ffff:127.0.0.1]",
            "http://169.254.169.254",
            "http://100.64.0.1",
            "http://0.1.2.3",
            "http://224.0.0.1",
            "http://192.0.2.1",
            "http://[fc00::1]",
            "http://user:password@example.org",
            "file:///etc/passwd",
        ] {
            assert!(
                validate(&Url::parse(address).expect("should parse the URL")).is_err(),
                "should reject the unsafe destination {address}"
            );
        }
    }

    #[tokio::test(start_paused = true)]
    async fn pacing_across_callers() {
        let pacer = Pacer::default();
        let start = tokio::time::Instant::now();
        pacer
            .wait("one.test", Duration::from_millis(50))
            .await
            .expect("should reserve a request");
        let ((), ()) = tokio::join!(
            async {
                pacer
                    .wait("one.test", Duration::from_millis(50))
                    .await
                    .expect("should reserve the second request");
            },
            async {
                pacer
                    .wait("other.test", Duration::from_millis(50))
                    .await
                    .expect("should allow another host immediately");
                assert_eq!(
                    start.elapsed(),
                    Duration::ZERO,
                    "another host should be independent"
                );
            }
        );
        pacer
            .wait("one.test", Duration::from_millis(50))
            .await
            .expect("should reserve the third request");
        assert_eq!(
            start.elapsed(),
            Duration::from_millis(100),
            "callers should share the host interval"
        );
        pacer
            .wait("one.test", Duration::from_millis(200))
            .await
            .expect("should apply a longer requested interval");
        assert_eq!(
            start.elapsed(),
            Duration::from_millis(300),
            "should honor the current caller's longer interval"
        );
        pacer
            .wait("one.test", Duration::ZERO)
            .await
            .expect("should honor the preceding caller's interval");
        assert_eq!(
            start.elapsed(),
            Duration::from_millis(500),
            "a faster caller should retain the preceding caller's spacing"
        );
    }

    #[test]
    fn retry_after_saturates() {
        let mut headers = HeaderMap::new();
        headers.insert(
            RETRY_AFTER,
            HeaderValue::from_static("18446744073709551615"),
        );
        assert_eq!(
            retry_delay(&headers, 0),
            Duration::from_secs(30),
            "server delays should saturate before the cap"
        );
        headers.insert(RETRY_AFTER, HeaderValue::from_static("not-an-integer"));
        assert_eq!(
            retry_delay(&headers, 2),
            Duration::from_secs(2),
            "invalid delays should use exponential backoff"
        );
    }
}

#[cfg(test)]
mod response_tests {
    use alloc::sync::Arc;
    use core::{
        sync::atomic::{AtomicUsize, Ordering},
        time::Duration,
    };

    use axum::{
        Json, Router,
        http::{HeaderMap, StatusCode},
        response::IntoResponse as _,
        routing::get,
    };
    use reqwest::Url;
    use serde_json::json;

    use super::fetch;
    use crate::sources::tests::{public_client, server};

    #[tokio::test]
    async fn fetch_throttled_response() {
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&requests);
        let server = server(Router::new().route(
            "/",
            get(move || {
                let counter = Arc::clone(&counter);
                async move {
                    if counter.fetch_add(1, Ordering::Relaxed) == 0 {
                        (StatusCode::TOO_MANY_REQUESTS, [("retry-after", "0")]).into_response()
                    } else {
                        Json(json!({"items": [1]})).into_response()
                    }
                }
            }),
        ))
        .await;
        let (client, url) = public_client(&server);
        let value = fetch(
            &client,
            &Url::parse(&url).expect("should parse the URL"),
            &HeaderMap::new(),
            Duration::ZERO,
        )
        .await
        .expect("should retry a throttled response");
        assert_eq!(
            value,
            json!({"items": [1]}),
            "should return the successful response"
        );
        assert_eq!(requests.load(Ordering::Relaxed), 2, "should retry once");
    }
}
