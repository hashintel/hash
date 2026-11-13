//! HTTP transport for exact stored request bodies.

#[cfg(test)]
mod tests;

use core::{pin::Pin, time::Duration};
use std::sync::Mutex;

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_middleware::authentication::{
    request::ACTOR_ID_HEADER, service_secret::SERVICE_AUTH_SCHEME,
};
use reqwest::{
    Client, Method, Response, Url,
    header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue, RETRY_AFTER},
    redirect::Policy,
};
use serde_json::value::RawValue;
use tokio::time::Instant;
use type_system::principal::actor::ActorEntityUuid;

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
    /// Returns [`GraphError::Configuration`] for a non-HTTP URL, embedded credentials,
    /// an empty or invalid service credential, or failure to construct the HTTP client.
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
        let mut authorization = HeaderValue::from_str(&format!(
            "{SERVICE_AUTH_SCHEME} {}",
            service_secret.expose()
        ))
        .change_context(GraphError::Configuration)?;
        authorization.set_sensitive(true);
        drop(service_secret);
        let mut bulk = graph_url.clone();
        bulk.path_segments_mut()
            .map_err(|()| Report::new(GraphError::Configuration))?
            .pop_if_empty()
            .push("entities")
            .push("bulk");
        let client = Client::builder()
            .redirect(Policy::none())
            .no_proxy()
            .timeout(Duration::from_secs(120))
            .build()
            .change_context(GraphError::Configuration)?;
        Ok(Self {
            bulk,
            authorization,
            client,
            not_before: Mutex::new(None),
        })
    }

    async fn exchange(
        &self,
        method: Method,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> GraphResponse {
        let not_before = *self
            .not_before
            .lock()
            .expect("should not poison pacing state");
        if let Some(deadline) = not_before {
            tokio::time::sleep_until(deadline).await;
        }
        let response = self
            .client
            .request(method, self.bulk.clone())
            .header(AUTHORIZATION, self.authorization.clone())
            .header(ACTOR_ID_HEADER, actor.to_string())
            .header(CONTENT_TYPE, "application/json")
            .body(array(bodies))
            .send()
            .await;
        match response {
            Ok(response) => self.answer(response).await,
            Err(error) => {
                let report = Report::new(error.without_url()).change_context(GraphError::Request);
                tracing::warn!(error = ?report, "Graph request did not complete");
                GraphResponse::Unreachable
            }
        }
    }

    async fn answer(&self, mut response: Response) -> GraphResponse {
        let status = response.status();
        if !status.is_success()
            && let Some(wait) = retry_after(response.headers())
        {
            *self
                .not_before
                .lock()
                .expect("should not poison pacing state") = Some(Instant::now() + wait);
        }
        let mut bytes = 0_usize;
        while let Ok(Some(chunk)) = response.chunk().await {
            bytes = bytes.saturating_add(chunk.len());
        }
        if status.is_success() {
            GraphResponse::Applied
        } else {
            tracing::warn!(status = status.as_u16(), bytes, "Graph refused the request");
            GraphResponse::Status(status.as_u16())
        }
    }
}

impl Graph for GraphClient {
    async fn create(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        self.exchange(Method::POST, actor, bodies).await
    }

    async fn patch(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> GraphResponse {
        self.exchange(Method::PATCH, actor, bodies).await
    }
}

fn array(bodies: &[&RawValue]) -> String {
    let mut array = String::with_capacity(
        bodies.iter().map(|body| body.get().len()).sum::<usize>() + bodies.len() + 1,
    );
    array.push('[');
    for (index, body) in bodies.iter().enumerate() {
        if index > 0 {
            array.push(',');
        }
        array.push_str(body.get());
    }
    array.push(']');
    array
}

fn retry_after(headers: &HeaderMap) -> Option<Duration> {
    let seconds = headers.get(RETRY_AFTER)?.to_str().ok()?;
    if seconds.is_empty() || !seconds.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    seconds
        .parse::<u64>()
        .ok()
        .map(|seconds| Duration::from_secs(seconds.min(30)))
}
