//! Sends planned writes to the Graph's entity API.
//!
//! Each [`PlannedWrite`] is sent as the requests it was planned with, so a retry sends the same
//! bytes. An upsert creates the entity with its deterministic ID and patches it instead if it
//! already exists. An archive of an entity the Graph does not have succeeds, as there is nothing
//! left to archive.
//!
//! The client authenticates as a service and acts for the actor each write is sent for, which is
//! the owner of the run.

#[cfg(test)]
mod tests;

use core::{pin::Pin, time::Duration};

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::SERVICE_AUTH_SCHEME,
};
use reqwest::{
    Client, Method, Response, StatusCode, Url,
    header::{AUTHORIZATION, CONTENT_TYPE, HeaderValue},
    redirect::Policy,
};
use serde_json::value::RawValue;
use type_system::principal::actor::ActorEntityUuid;

use super::{PlannedWrite, plan::SavedRequests};

/// The longest part of a rejection's body kept for reporting.
const DIAGNOSTIC_LIMIT: usize = 1024;

/// Why a write could not be sent to the Graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum GraphError {
    /// The Graph URL or service secret cannot be used.
    #[display("the Graph client is not configured correctly")]
    Configuration,
    /// The write's payload is not one planning produced.
    #[display("the write's payload cannot be read")]
    Payload,
    /// The request did not reach the Graph, or its response was not received.
    #[display("the request to the Graph failed")]
    Request,
    /// The Graph answered with a status that does not apply the write.
    #[display("the Graph rejected the request with status {status}")]
    Status { status: u16 },
}

/// What the Graph did with a write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Applied {
    Created,
    /// The entity existed, so it was patched instead.
    Patched,
    Archived,
    /// The entity to archive does not exist.
    Absent,
}

/// Sends planned writes to the Graph's entity API.
#[derive(Debug)]
pub struct GraphClient {
    entities: Url,
    service_secret: Pin<Box<Secret<str>>>,
    client: Client,
}

impl GraphClient {
    /// A client for the Graph at `graph_url`, authenticating with `service_secret`.
    ///
    /// # Errors
    ///
    /// Returns [`GraphError::Configuration`] if `graph_url` is not an HTTP(S) URL without
    /// credentials, the secret is empty, or the HTTP client cannot be built.
    pub fn new(
        graph_url: &Url,
        service_secret: Pin<Box<Secret<str>>>,
    ) -> Result<Self, Report<GraphError>> {
        if !matches!(graph_url.scheme(), "http" | "https")
            || !graph_url.username().is_empty()
            || graph_url.password().is_some()
            || service_secret.expose().is_empty()
        {
            return Err(Report::new(GraphError::Configuration));
        }
        let mut entities = graph_url.clone();
        entities
            .path_segments_mut()
            .map_err(|()| Report::new(GraphError::Configuration))?
            .pop_if_empty()
            .push("entities");
        let client = Client::builder()
            .redirect(Policy::none())
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .build()
            .change_context(GraphError::Configuration)?;
        Ok(Self {
            entities,
            service_secret,
            client,
        })
    }

    /// Sends `write` to the Graph, acting for `actor`.
    ///
    /// # Errors
    ///
    /// - [`GraphError::Payload`] if the write's payload cannot be read
    /// - [`GraphError::Request`] if a request does not complete
    /// - [`GraphError::Status`] if the Graph rejects a request, with its response body attached
    pub async fn send(
        &self,
        actor: ActorEntityUuid,
        write: &PlannedWrite,
    ) -> Result<Applied, Report<GraphError>> {
        match write
            .payload
            .requests()
            .change_context(GraphError::Payload)?
        {
            SavedRequests::Upsert { create, patch } => {
                let response = self.request(Method::POST, actor, create).await?;
                if response.status() != StatusCode::CONFLICT {
                    return accepted(response, Applied::Created).await;
                }
                let response = self.request(Method::PATCH, actor, patch).await?;
                accepted(response, Applied::Patched).await
            }
            SavedRequests::Archive { archive } => {
                let response = self.request(Method::PATCH, actor, archive).await?;
                if response.status() == StatusCode::NOT_FOUND {
                    return Ok(Applied::Absent);
                }
                accepted(response, Applied::Archived).await
            }
        }
    }

    async fn request(
        &self,
        method: Method,
        actor: ActorEntityUuid,
        body: &RawValue,
    ) -> Result<Response, Report<GraphError>> {
        let mut authorization = HeaderValue::from_str(&format!(
            "{SERVICE_AUTH_SCHEME} {}",
            self.service_secret.expose()
        ))
        .change_context(GraphError::Configuration)?;
        authorization.set_sensitive(true);
        self.client
            .request(method, self.entities.clone())
            .header(AUTHORIZATION, authorization)
            .header(ACTOR_ID_HEADER, actor.to_string())
            .header(CONTENT_TYPE, "application/json")
            .body(body.get().to_owned())
            .send()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(GraphError::Request)
    }
}

/// `applied` if the Graph accepted the request, or its status and body otherwise.
async fn accepted(response: Response, applied: Applied) -> Result<Applied, Report<GraphError>> {
    let status = response.status();
    if status.is_success() {
        return Ok(applied);
    }
    let error = Report::new(GraphError::Status {
        status: status.as_u16(),
    });
    let Ok(body) = response.text().await else {
        return Err(error);
    };
    Err(error.attach(body.chars().take(DIAGNOSTIC_LIMIT).collect::<String>()))
}
