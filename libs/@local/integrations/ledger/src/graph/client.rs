//! HTTP transport for request bodies.

use core::pin::Pin;
use std::sync::Mutex;

use error_stack::Report;
use hash_crypto::Secret;
use reqwest::{Client, header::HeaderValue};
use serde_json::value::RawValue;
use tokio::time::Instant;
use type_system::principal::actor::ActorEntityUuid;
use url::Url;

use super::{Graph, GraphResponse};

/// Why the Graph client could not be configured or its request could not complete.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum GraphError {
    #[display("the Graph client is not configured correctly")]
    Configuration,
    #[display("the request to the Graph failed")]
    Request,
}

/// Sends atomic bulk requests with the run actor and a service credential.
#[derive(Debug)]
pub struct GraphClient {
    bulk: Url,
    authorization: HeaderValue,
    client: Client,
    not_before: Mutex<Option<Instant>>,
}

impl GraphClient {
    /// Constructs a client without redirects or proxies and with a 120-second timeout.
    ///
    /// # Errors
    ///
    /// - [`GraphError::Configuration`] for a non-HTTP URL, embedded credentials, an empty or
    ///   invalid service credential, or failure to construct the HTTP client
    pub fn new(
        graph_url: &Url,
        service_secret: Pin<Box<Secret<str>>>,
    ) -> Result<Self, Report<GraphError>> {
        unimplemented!()
    }
}

impl Graph for GraphClient {
    async fn create(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        unimplemented!()
    }

    async fn patch(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        unimplemented!()
    }
}
