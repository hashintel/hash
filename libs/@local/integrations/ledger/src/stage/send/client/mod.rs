//! Sends request bodies to the Graph's entity API and says what the Graph answered.
//!
//! The client authenticates as a service and acts for the actor each request is sent for, which
//! is the owner of the run.

#[cfg(test)]
mod tests;

use core::time::Duration;

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::SERVICE_AUTH_SCHEME,
};
use reqwest::{
    Client, Method, StatusCode,
    header::{AUTHORIZATION, CONTENT_TYPE, HeaderValue},
    redirect::Policy,
};
use serde_json::value::RawValue;
use type_system::principal::actor::ActorEntityUuid;
use url::Url;

use crate::stage::MAX_MESSAGE;

/// Why the Graph client cannot be set up.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum GraphError {
    /// The Graph URL or service secret cannot be used.
    #[display("the Graph client is not configured correctly")]
    Configuration,
}

/// What the Graph did with a request.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Response {
    Applied,
    /// No answer, a timeout, or a status that says to try again later.
    Unavailable,
    /// Any other status, with the start of the Graph's message.
    Refused {
        status: u16,
        message: Box<str>,
    },
}

/// Sends request bodies to the Graph's entity API.
#[derive(Debug)]
pub struct GraphClient {
    entities: Url,
    bulk: Url,
    authorization: HeaderValue,
    client: Client,
}

impl GraphClient {
    /// A client for the Graph at `graph_url`, authenticating with `service_secret`.
    ///
    /// # Errors
    ///
    /// Returns [`GraphError::Configuration`] if `graph_url` is not an HTTP(S) URL without
    /// credentials whose path ends in `/`, the secret is empty or not a header value, or the HTTP
    /// client cannot be built.
    pub fn new(graph_url: &Url, service_secret: &Secret<str>) -> Result<Self, Report<GraphError>> {
        if !matches!(graph_url.scheme(), "http" | "https")
            || !graph_url.username().is_empty()
            || graph_url.password().is_some()
            || !graph_url.path().ends_with('/')
            || service_secret.expose().is_empty()
        {
            return Err(Report::new(GraphError::Configuration));
        }
        let entities = graph_url
            .join("entities")
            .change_context(GraphError::Configuration)?;
        let bulk = graph_url
            .join("entities/bulk")
            .change_context(GraphError::Configuration)?;
        let mut authorization = HeaderValue::from_str(&format!(
            "{SERVICE_AUTH_SCHEME} {}",
            service_secret.expose()
        ))
        .change_context(GraphError::Configuration)?;
        authorization.set_sensitive(true);
        let client = Client::builder()
            .redirect(Policy::none())
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .build()
            .change_context(GraphError::Configuration)?;
        Ok(Self {
            entities,
            bulk,
            authorization,
            client,
        })
    }

    /// Creates the entities of `bodies` in one request, acting for `actor`.
    pub(super) async fn create_bulk(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> Response {
        self.request(Method::POST, &self.bulk, actor, list(bodies))
            .await
    }

    /// Patches the entities of `bodies` in one request, acting for `actor`.
    pub(super) async fn patch_bulk(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> Response {
        self.request(Method::PATCH, &self.bulk, actor, list(bodies))
            .await
    }

    /// Creates the entity of `body`, acting for `actor`.
    pub(super) async fn create(&self, actor: ActorEntityUuid, body: &RawValue) -> Response {
        self.request(Method::POST, &self.entities, actor, body.get().to_owned())
            .await
    }

    /// Patches the entity of `body`, acting for `actor`.
    pub(super) async fn patch(&self, actor: ActorEntityUuid, body: &RawValue) -> Response {
        self.request(Method::PATCH, &self.entities, actor, body.get().to_owned())
            .await
    }

    async fn request(
        &self,
        method: Method,
        url: &Url,
        actor: ActorEntityUuid,
        body: String,
    ) -> Response {
        let sent = self
            .client
            .request(method, url.clone())
            .header(AUTHORIZATION, self.authorization.clone())
            .header(ACTOR_ID_HEADER, actor.to_string())
            .header(CONTENT_TYPE, "application/json")
            .body(body)
            .send()
            .await;
        match sent {
            Ok(response) => classify(response).await,
            Err(error) => {
                tracing::warn!(error = %error.without_url(), "the Graph did not answer");
                Response::Unavailable
            }
        }
    }
}

/// What `response` says the Graph did.
async fn classify(response: reqwest::Response) -> Response {
    match response.status() {
        status if status.is_success() => Response::Applied,
        StatusCode::TOO_MANY_REQUESTS
        | StatusCode::BAD_GATEWAY
        | StatusCode::SERVICE_UNAVAILABLE
        | StatusCode::GATEWAY_TIMEOUT => Response::Unavailable,
        status => Response::Refused {
            status: status.as_u16(),
            message: response
                .text()
                .await
                .unwrap_or_default()
                .chars()
                .take(MAX_MESSAGE)
                .collect(),
        },
    }
}

/// `bodies` as one JSON array, which a bulk route reads.
fn list(bodies: &[&RawValue]) -> String {
    let bodies = bodies.iter().map(|body| body.get()).collect::<Vec<_>>();
    format!("[{}]", bodies.join(","))
}
