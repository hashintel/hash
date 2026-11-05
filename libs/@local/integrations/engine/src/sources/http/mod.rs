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

/// Resolves a name only if every address it resolves to is public.
///
/// Fails with an [`io::ErrorKind::PermissionDenied`] error otherwise.
pub(super) struct PublicResolver;

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
/// The last reserved request slot for each host.
///
/// Each caller is spaced by its own interval only, so a definition with a long interval cannot
/// delay other runs that request the same host.
struct Pacer(Mutex<BTreeMap<String, Instant>>);

impl Pacer {
    async fn wait(&self, host: &str, interval: Duration) -> Result<(), Report<SourceError>> {
        let slot = {
            let mut slots = self
                .0
                .lock()
                .map_err(|_error| Report::new(SourceError::Request))?;
            let now = Instant::now();
            if slots.len() > 64 {
                slots.retain(|_, last| {
                    now.saturating_duration_since(*last) < Duration::from_hours(24)
                });
            }
            let slot = match slots.get(host) {
                Some(last) => last
                    .checked_add(interval)
                    .ok_or_else(|| Report::new(SourceError::Configuration))?
                    .max(now),
                None => now,
            };
            slots.insert(host.to_owned(), slot);
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
mod tests;

#[cfg(test)]
mod response_tests;
