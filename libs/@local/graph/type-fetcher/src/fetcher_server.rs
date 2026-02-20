use alloc::sync::Arc;
use core::{net::IpAddr, time::Duration};
use std::{collections::HashMap, io};

use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use include_dir::{Dir, DirEntry, include_dir};
use reqwest::{
    Client,
    dns::{Addrs, Name, Resolve, Resolving},
    header::{ACCEPT, USER_AGENT},
    redirect,
};
use reqwest_middleware::ClientBuilder;
use reqwest_tracing::TracingMiddleware;
use tarpc::context::Context;
use time::OffsetDateTime;
use type_system::ontology::VersionedUrl;
use url::Url;

use crate::fetcher::{FetchedOntologyType, Fetcher, FetcherError};

/// SSRF protection that ensures only globally routable addresses are reachable.
///
/// Provides three layers of protection, all using [`IpAddr::is_global`] for validation:
/// - As a DNS [`Resolve`]r: filters resolved addresses, which also prevents DNS rebinding attacks
///   since filtering happens inside the resolver itself.
/// - Via [`reject_ip_literal`](Self::reject_ip_literal): blocks URLs with non-global IP-literal
///   hosts (e.g. `http://127.0.0.1/...`), which bypass DNS resolution entirely.
/// - Via [`redirect_policy`](Self::redirect_policy): blocks redirects to non-global IP literals,
///   preventing SSRF through redirect chains.
///
/// [`IpAddr::is_global`]: core::net::IpAddr::is_global
struct SsrfSafeResolver;

impl SsrfSafeResolver {
    /// Returns the non-global IP if the URL host is an IP literal that is not globally routable.
    ///
    /// Returns `None` for domain hosts (handled by the [`Resolve`] implementation) and for
    /// globally routable IP addresses.
    fn non_global_ip_literal(url: &Url) -> Option<IpAddr> {
        let ip = match url.host()? {
            url::Host::Ipv4(addr) => IpAddr::V4(addr),
            url::Host::Ipv6(addr) => IpAddr::V6(addr),
            url::Host::Domain(_) => return None,
        };

        (!ip.is_global()).then_some(ip)
    }

    /// Rejects URLs whose host is a non-global IP literal.
    ///
    /// DNS resolution is not triggered for IP-literal hosts, so the [`Resolve`] implementation
    /// cannot catch them. This method must be called before each request to close that gap.
    fn reject_ip_literal(url: &Url) -> Result<(), FetcherError> {
        if let Some(ip) = Self::non_global_ip_literal(url) {
            return Err(FetcherError::Network(format!(
                "Request to `{url}` blocked: host address {ip} is not globally routable"
            )));
        }
        Ok(())
    }

    /// Creates a redirect policy that blocks redirects to non-global IP literals.
    ///
    /// This prevents SSRF via redirect chains where an attacker-controlled domain redirects to a
    /// private IP (e.g. `http://169.254.169.254/`). Domain-based redirect targets are allowed
    /// since they will be validated by the [`Resolve`] implementation on connection.
    fn redirect_policy() -> redirect::Policy {
        redirect::Policy::custom(|attempt| {
            if let Some(ip) = Self::non_global_ip_literal(attempt.url()) {
                let url = attempt.url().clone();
                return attempt.error(format!(
                    "Redirect to `{url}` blocked: host address {ip} is not globally routable"
                ));
            }
            redirect::Policy::default().redirect(attempt)
        })
    }
}

impl Resolve for SsrfSafeResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let addrs: Vec<_> = tokio::net::lookup_host((name.as_str(), 0))
                .await?
                .filter(|addr| addr.ip().is_global())
                .collect();

            if addrs.is_empty() {
                return Err(format!(
                    "DNS resolution for `{}` blocked: no globally routable addresses found",
                    name.as_str()
                )
                .into());
            }

            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}

#[derive(Clone)]
pub struct FetchServer {
    pub buffer_size: usize,
    pub predefined_types: HashMap<VersionedUrl, FetchedOntologyType>,
}

const PREDEFINED_TYPES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/predefined_types");

impl FetchServer {
    /// Load predefined types from the `predefined_types` directory
    ///
    /// # Errors
    ///
    /// - If the predefined types directory cannot be found
    /// - If a predefined type cannot be deserialized
    #[tracing::instrument(skip(self))]
    pub fn load_predefined_types(&mut self) -> Result<(), Report<io::Error>> {
        for entry in PREDEFINED_TYPES.find("**/*.json").change_context_lazy(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "No JSON files in predefined types directory found",
            )
        })? {
            if let DirEntry::File(file) = entry {
                let ontology_type = serde_json::from_slice(file.contents())
                    .map_err(io::Error::from)
                    .attach_with(|| file.path().display().to_string())?;
                let id = match &ontology_type {
                    FetchedOntologyType::DataType(data_type) => data_type.id.clone(),
                    FetchedOntologyType::PropertyType(property_type) => property_type.id.clone(),
                    FetchedOntologyType::EntityType(entity_type) => entity_type.id.clone(),
                };
                self.predefined_types.insert(id, ontology_type);
            }
        }

        Ok(())
    }
}

impl Fetcher for FetchServer {
    #[tracing::instrument(skip(self, _context))]
    async fn fetch_ontology_types(
        mut self,
        _context: Context,
        ontology_type_urls: Vec<VersionedUrl>,
    ) -> Result<Vec<(FetchedOntologyType, OffsetDateTime)>, FetcherError> {
        self.load_predefined_types().map_err(|err| {
            FetcherError::PredefinedTypes(format!("Error loading predefined types: {err:?}"))
        })?;

        let client = Client::builder()
            .https_only(true)
            .dns_resolver(Arc::new(SsrfSafeResolver))
            .redirect(SsrfSafeResolver::redirect_policy())
            .build()
            .map_err(|err| FetcherError::Network(format!("Error building HTTP client: {err:?}")))?;
        let client = ClientBuilder::new(client)
            .with(TracingMiddleware::default())
            .build();
        let predefined_types = &self.predefined_types;
        stream::iter(ontology_type_urls)
            .map(|url| {
                let client = client.clone();
                async move {
                    let ontology_type = if let Some(ontology_type) = predefined_types.get(&url) {
                        ontology_type.clone()
                    } else {
                        let request_url = url.to_url();
                        SsrfSafeResolver::reject_ip_literal(&request_url)?;
                        client
                            .get(request_url)
                            .header(ACCEPT, "application/json")
                            .header(USER_AGENT, "HASH Graph")
                            .timeout(Duration::from_secs(10))
                            .send()
                            .await
                            .map_err(|err| {
                                tracing::error!(error=?err, %url, "Could not fetch ontology type");
                                FetcherError::Network(format!("Error fetching {url}: {err:?}"))
                            })?
                            .json::<FetchedOntologyType>()
                            .await
                            .map_err(|err| {
                                tracing::error!(error=?err, %url, "Could not deserialize response");
                                FetcherError::Serialization(format!(
                                    "Error deserializing {url}: {err:?}"
                                ))
                            })?
                    };

                    Ok::<_, FetcherError>((ontology_type, OffsetDateTime::now_utc()))
                }
            })
            .buffer_unordered(self.buffer_size)
            .try_collect()
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reqwest_https_only_rejects_http_urls() {
        let client = Client::builder()
            .https_only(true)
            .build()
            .expect("client should build");

        let err = client
            .get("http://example.com/types/v/1")
            .send()
            .await
            .expect_err("http scheme should be rejected");

        assert!(
            err.is_builder(),
            "expected builder error from HTTPS-only restriction, got: {err}"
        );
    }

    #[tokio::test]
    async fn ssrf_resolver_blocks_localhost() {
        let resolver = SsrfSafeResolver;
        let err = resolver
            .resolve("localhost".parse().expect("valid name"))
            .await
            .err()
            .expect("localhost should be blocked");

        assert!(
            err.to_string().contains("no globally routable addresses"),
            "expected SSRF blocking error, got: {err}"
        );
    }

    #[tokio::test]
    async fn ssrf_resolver_allows_public_domain() {
        let resolver = SsrfSafeResolver;
        let result = resolver
            .resolve("example.com".parse().expect("valid name"))
            .await;
        assert!(result.is_ok(), "example.com should be allowed");
    }

    #[test]
    fn rejects_ipv4_loopback_literal() {
        let url = Url::parse("http://127.0.0.1/types/v/1").expect("valid URL");
        assert!(
            SsrfSafeResolver::reject_ip_literal(&url).is_err(),
            "127.0.0.1 should be blocked"
        );
    }

    #[test]
    fn rejects_ipv4_private_literal() {
        let url = Url::parse("http://10.0.0.1/types/v/1").expect("valid URL");
        assert!(
            SsrfSafeResolver::reject_ip_literal(&url).is_err(),
            "10.0.0.1 should be blocked"
        );
    }

    #[test]
    fn rejects_ipv4_link_local_literal() {
        let url = Url::parse("http://169.254.169.254/latest/meta-data/").expect("valid URL");
        assert!(
            SsrfSafeResolver::reject_ip_literal(&url).is_err(),
            "169.254.169.254 (AWS metadata) should be blocked"
        );
    }

    #[test]
    fn rejects_ipv6_loopback_literal() {
        let url = Url::parse("http://[::1]/types/v/1").expect("valid URL");
        assert!(
            SsrfSafeResolver::reject_ip_literal(&url).is_err(),
            "::1 should be blocked"
        );
    }

    #[test]
    fn allows_global_ipv4_literal() {
        let url = Url::parse("http://93.184.215.14/types/v/1").expect("valid URL");
        assert!(
            SsrfSafeResolver::reject_ip_literal(&url).is_ok(),
            "93.184.215.14 (example.com) should be allowed"
        );
    }

    #[test]
    fn allows_domain_host() {
        let url = Url::parse("https://example.com/types/v/1").expect("valid URL");
        assert!(
            SsrfSafeResolver::reject_ip_literal(&url).is_ok(),
            "domain hosts should always pass IP-literal check"
        );
    }
}
