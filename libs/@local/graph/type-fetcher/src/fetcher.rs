use core::{error::Error, fmt, time::Duration};

use opentelemetry::propagation::Injector;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest_middleware::ClientWithMiddleware;
use reqwest_tracing::TracingMiddleware;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use tracing_opentelemetry::OpenTelemetrySpanExt as _;
use type_system::ontology::{
    VersionedUrl, data_type::DataType, entity_type::EntityType, property_type::PropertyType,
};
use url::Url;

/// Path of the HTTP endpoint accepting a JSON array of [`VersionedUrl`]s and returning the
/// fetched ontology types as a JSON array of [`FetchedOntologyType`]/timestamp pairs.
pub const FETCH_ONTOLOGY_TYPES_PATH: &str = "/fetch-ontology-types";

/// Timeout for a single call to the type fetcher service.
///
/// Matches the default request deadline used by the previous RPC transport.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

// We would really like to use error-stack for this. It's not possible because
// we need Serialize and Deserialize for `Report`
#[derive(Debug, Serialize, Deserialize)]
pub enum FetcherError {
    Network(String),
    PredefinedTypes(String),
    Serialization(String),
}

impl Error for FetcherError {}

impl fmt::Display for FetcherError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the type fetcher encountered an error during execution: ")?;

        match self {
            Self::Network(message)
            | Self::Serialization(message)
            | Self::PredefinedTypes(message) => fmt.write_str(message),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
#[expect(
    clippy::enum_variant_names,
    reason = "Ontology types share a common suffix"
)]
pub enum FetchedOntologyType {
    DataType(Box<DataType>),
    PropertyType(Box<PropertyType>),
    EntityType(Box<EntityType>),
}

struct HeaderInjector<'a>(&'a mut HeaderMap);

impl Injector for HeaderInjector<'_> {
    fn set(&mut self, key: &str, value: String) {
        if let Ok(name) = HeaderName::from_bytes(key.as_bytes())
            && let Ok(val) = HeaderValue::from_str(&value)
        {
            self.0.insert(name, val);
        }
    }
}

/// HTTP client for the type fetcher service.
#[derive(Debug, Clone)]
pub struct FetcherClient {
    client: ClientWithMiddleware,
    endpoint: Url,
}

impl FetcherClient {
    /// Creates a client for the type fetcher service listening at `host:port`.
    ///
    /// # Errors
    ///
    /// Returns [`FetcherError::Network`] if the address is not a valid URL host or the HTTP
    /// client cannot be constructed.
    pub fn new(host: &str, port: u16) -> Result<Self, FetcherError> {
        let endpoint = Url::parse(&format!("http://{host}:{port}{FETCH_ONTOLOGY_TYPES_PATH}"))
            .map_err(|error| {
                FetcherError::Network(format!(
                    "Invalid type fetcher address `{host}:{port}`: {error}"
                ))
            })?;
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| {
                FetcherError::Network(format!("Error building HTTP client: {error:?}"))
            })?;

        Ok(Self {
            client: reqwest_middleware::ClientBuilder::new(client)
                .with(TracingMiddleware::default())
                .build(),
            endpoint,
        })
    }

    /// Creates headers carrying the current trace context (W3C `traceparent`), so the type
    /// fetcher can attach its spans to the calling trace.
    fn trace_context_headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        opentelemetry::global::get_text_map_propagator(|propagator| {
            propagator.inject_context(
                &tracing::Span::current().context(),
                &mut HeaderInjector(&mut headers),
            );
        });
        headers
    }

    /// Fetches a list of ontology types identified by their [`VersionedUrl`] and returns them.
    ///
    /// # Errors
    ///
    /// - [`FetcherError::Network`] if the type fetcher service cannot be reached or reports a
    ///   request failure
    /// - [`FetcherError::Serialization`] if the response payload cannot be deserialized
    pub async fn fetch_ontology_types(
        &self,
        ontology_type_urls: Vec<VersionedUrl>,
    ) -> Result<Vec<(FetchedOntologyType, OffsetDateTime)>, FetcherError> {
        let response = self
            .client
            .post(self.endpoint.clone())
            .headers(Self::trace_context_headers())
            .json(&ontology_type_urls)
            .send()
            .await
            .map_err(|error| {
                FetcherError::Network(format!("Error calling type fetcher: {error:?}"))
            })?;

        let status = response.status();
        if status.is_success() {
            response.json().await.map_err(|error| {
                FetcherError::Serialization(format!(
                    "Error deserializing type fetcher response: {error:?}"
                ))
            })
        } else {
            // Error responses carry the `FetcherError` as their JSON body.
            Err(response.json().await.unwrap_or_else(|error| {
                FetcherError::Network(format!("Type fetcher returned status {status}: {error:?}"))
            }))
        }
    }
}
