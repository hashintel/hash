use alloc::{collections::BTreeMap, sync::Arc};
use core::{net::IpAddr, time::Duration};
use std::{
    io,
    sync::{Mutex, OnceLock},
};

use backon::{ExponentialBuilder, Retryable as _};
use error_stack::Report;
use reqwest::{
    Client, Url,
    dns::{Addrs, Name, Resolve, Resolving},
    header::{HeaderMap, RETRY_AFTER},
    redirect::Policy,
};
use serde_json::Value;
use tokio::{
    net::lookup_host,
    time::{Instant, sleep_until},
};
use url::Host;

use super::SourceError;

pub(super) fn client() -> Result<Client, Report<SourceError>> {
    Client::builder()
        .redirect(Policy::none())
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .dns_resolver(Arc::new(PublicResolver))
        .build()
        .map_err(|_error| Report::new(SourceError::Request))
}

struct PublicResolver;

impl Resolve for PublicResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let addresses: Vec<_> = lookup_host((name.as_str(), 0)).await?.collect();
            if addresses.is_empty() || addresses.iter().any(|address| !public(address.ip())) {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "destination is not exclusively public",
                )
                .into());
            }
            Ok(Box::new(addresses.into_iter()) as Addrs)
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
        Some(Host::Ipv4(address)) => Some(IpAddr::V4(address)),
        Some(Host::Ipv6(address)) => Some(IpAddr::V6(address)),
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
        sleep_until(slot).await;
        Ok(())
    }
}

pub(super) async fn fetch(
    client: &Client,
    url: &Url,
    headers: &HeaderMap,
    interval: Duration,
) -> Result<Value, Report<SourceError>> {
    static PACER: OnceLock<Pacer> = OnceLock::new();
    validate(url)?;
    let host = url
        .host_str()
        .ok_or_else(|| Report::new(SourceError::Destination))?;
    let mut response = (|| async {
        PACER
            .get_or_init(Pacer::default)
            .wait(host, interval)
            .await?;
        let response = client
            .get(url.clone())
            .headers(headers.clone())
            .send()
            .await
            .map_err(|_error| Report::new(SourceError::Request))?;
        if !response.status().is_success() {
            return Err(RequestFailure {
                error: Report::new(SourceError::Status {
                    status: response.status().as_u16(),
                }),
                retry_after: retry_after(response.headers()),
            });
        }
        Ok(response)
    })
    .retry(
        ExponentialBuilder::default()
            .with_min_delay(Duration::from_millis(500))
            .with_max_delay(Duration::from_secs(30))
            .with_max_times(10),
    )
    .when(|failure| {
        matches!(
            failure.error.current_context(),
            SourceError::Status { status: 429 }
        )
    })
    .adjust(|failure, delay| delay.map(|delay| failure.retry_after.unwrap_or(delay)))
    .await
    .map_err(|failure| failure.error)?;
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
    serde_json::from_slice(&bytes).map_err(|_error| Report::new(SourceError::Response))
}

struct RequestFailure {
    error: Report<SourceError>,
    retry_after: Option<Duration>,
}

impl From<Report<SourceError>> for RequestFailure {
    fn from(error: Report<SourceError>) -> Self {
        Self {
            error,
            retry_after: None,
        }
    }
}

fn retry_after(headers: &HeaderMap) -> Option<Duration> {
    headers
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|seconds| Duration::from_secs(seconds.min(30)))
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use axum::{Router, routing::get};
    use reqwest::{
        Url,
        header::{HeaderMap, HeaderValue, RETRY_AFTER},
    };
    use rstest::rstest;
    use tokio::time::Instant;

    use super::{Pacer, client, retry_after, validate};
    use crate::sources::{SourceError, tests::server};

    #[tokio::test]
    async fn destinations_reject_private_resolution() {
        let server = server(Router::new().route("/", get(|| async { "ok" }))).await;
        let url = server.url().replace("127.0.0.1", "localhost");
        let guarded = client().expect("should build a guarded client");
        let error = guarded
            .get(url)
            .send()
            .await
            .expect_err("should block private DNS destinations");
        assert!(
            error.is_request() || error.is_connect(),
            "should fail before an HTTP response"
        );
    }

    #[rstest]
    #[case::ipv4_loopback("http://127.0.0.1")]
    #[case::ipv6_loopback("http://[::1]")]
    #[case::mapped_loopback("http://[::ffff:127.0.0.1]")]
    #[case::link_local("http://169.254.169.254")]
    #[case::shared_address("http://100.64.0.1")]
    #[case::zero_network("http://0.1.2.3")]
    #[case::multicast("http://224.0.0.1")]
    #[case::documentation_address("http://192.0.2.1")]
    #[case::ipv6_private("http://[fc00::1]")]
    #[case::inline_credentials("http://user:password@example.org")]
    #[case::file_scheme("file:///etc/passwd")]
    fn destinations_invalid_url(#[case] address: &str) {
        let error = validate(&Url::parse(address).expect("should parse the URL"))
            .expect_err("should reject the unsafe destination");
        assert!(
            matches!(error.current_context(), SourceError::Destination),
            "should identify an invalid destination"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn pacing_across_callers() {
        let pacer = Pacer::default();
        let start = Instant::now();
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

    #[rstest]
    #[case::zero("0", Some(Duration::ZERO))]
    #[case::seconds("1", Some(Duration::from_secs(1)))]
    #[case::capped("31", Some(Duration::from_secs(30)))]
    #[case::maximum("18446744073709551615", Some(Duration::from_secs(30)))]
    #[case::invalid("not-an-integer", None)]
    fn retry_after_values(#[case] value: &'static str, #[case] expected: Option<Duration>) {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, HeaderValue::from_static(value));
        assert_eq!(
            retry_after(&headers),
            expected,
            "numeric delays should be capped and invalid values should leave the backoff unchanged"
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
    use rstest::rstest;
    use serde_json::json;
    use tokio::time::Instant;

    use super::fetch;
    use crate::sources::{
        SourceError,
        tests::{public_client, server},
    };

    #[tokio::test]
    async fn fetch_stops_at_retry_budget() {
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&requests);
        let server = server(Router::new().route(
            "/",
            get(move || {
                counter.fetch_add(1, Ordering::Relaxed);
                async { (StatusCode::TOO_MANY_REQUESTS, [("retry-after", "0")]) }
            }),
        ))
        .await;
        let (client, url) = public_client(&server);
        let error = fetch(
            &client,
            &Url::parse(&url).expect("should parse the URL"),
            &HeaderMap::new(),
            Duration::ZERO,
        )
        .await
        .expect_err("should stop after ten retries");
        assert!(matches!(
            error.current_context(),
            SourceError::Status { status: 429 }
        ));
        assert_eq!(requests.load(Ordering::Relaxed), 11);
    }

    #[rstest]
    #[case::unavailable(StatusCode::SERVICE_UNAVAILABLE)]
    #[case::unauthorized(StatusCode::UNAUTHORIZED)]
    #[case::invalid_json(StatusCode::OK)]
    #[tokio::test]
    async fn fetch_does_not_retry_other_failures(#[case] status: StatusCode) {
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&requests);
        let server = server(Router::new().route(
            "/",
            get(move || {
                counter.fetch_add(1, Ordering::Relaxed);
                async move { (status, [("retry-after", "0")], "invalid JSON") }
            }),
        ))
        .await;
        let (client, url) = public_client(&server);
        let error = fetch(
            &client,
            &Url::parse(&url).expect("should parse the URL"),
            &HeaderMap::new(),
            Duration::ZERO,
        )
        .await
        .expect_err("should return the failure without retrying");
        if status == StatusCode::OK {
            assert!(matches!(error.current_context(), SourceError::Response));
        } else {
            assert!(
                matches!(error.current_context(), SourceError::Status { status: actual } if *actual == status.as_u16())
            );
        }
        assert_eq!(requests.load(Ordering::Relaxed), 1);
    }

    #[rstest]
    #[case::immediate("0", Duration::ZERO)]
    #[case::server_delay("1", Duration::from_secs(1))]
    #[case::fallback("invalid", Duration::from_millis(500))]
    #[tokio::test]
    async fn fetch_throttled_response(
        #[case] retry_after: &'static str,
        #[case] minimum_delay: Duration,
    ) {
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&requests);
        let server = server(Router::new().route(
            "/",
            get(move || {
                let counter = Arc::clone(&counter);
                async move {
                    if counter.fetch_add(1, Ordering::Relaxed) == 0 {
                        (
                            StatusCode::TOO_MANY_REQUESTS,
                            [("retry-after", retry_after)],
                        )
                            .into_response()
                    } else {
                        Json(json!({"items": [1]})).into_response()
                    }
                }
            }),
        ))
        .await;
        let (client, url) = public_client(&server);
        let start = Instant::now();
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
        assert!(
            start.elapsed() >= minimum_delay,
            "retry delay should be honored"
        );
    }
}
