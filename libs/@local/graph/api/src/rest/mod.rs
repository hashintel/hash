pub mod authentication;
mod caller;
mod credentials;
mod documentation;
mod extract;
mod internal;
pub mod legacy;
mod middleware;
mod openapi;
pub mod probe;
mod public;
pub mod rate_limit;
mod router;
mod routing;
pub mod telemetry;

#[cfg(test)]
pub(crate) mod test_utils;

use alloc::sync::Arc;

use aide::openapi::OpenApi;
use axum::Router;
use error_stack::Report;
use hash_graph_store::pool::StorePool;
use hash_middleware::authentication::Challenge;
use hash_temporal_client::TemporalClient;

pub use self::router::{Dependencies, router};

/// The callers an API admits, which selects the provider chain authenticating its requests.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Audience {
    /// Callers presenting an API token. A request without a credential is answered `401`.
    Public,
    /// The HASH frontend and services. A request without a credential is served anonymously.
    Internal,
}

/// What the handlers of the public and internal APIs read through [`State`].
///
/// [`State`]: axum::extract::State
pub(crate) struct ApiState<S> {
    store: Arc<S>,
    temporal_client: Option<Arc<TemporalClient>>,
}

impl<S> ApiState<S> {
    pub(crate) const fn new(store: Arc<S>, temporal_client: Option<Arc<TemporalClient>>) -> Self {
        Self {
            store,
            temporal_client,
        }
    }
}

impl<S: StorePool> ApiState<S> {
    /// Acquires a store from the pool.
    ///
    /// The store starts the workflows that follow a write, such as computing embeddings, through
    /// the Temporal client.
    ///
    /// # Errors
    ///
    /// Returns the pool's error if no store can be acquired.
    pub(crate) fn acquire(
        &self,
    ) -> impl Future<Output = Result<S::Store<'_>, Report<S::Error>>> + Send {
        self.store.acquire(self.temporal_client.clone())
    }
}

impl<S> Clone for ApiState<S> {
    fn clone(&self) -> Self {
        Self {
            store: Arc::clone(&self.store),
            temporal_client: self.temporal_client.clone(),
        }
    }
}

/// An API's routes, nested under its prefix, with the document describing them.
///
/// The routes read the state `T`, which [`with_state`](Self::with_state) hands them.
pub(crate) struct Api<T = ()> {
    audience: Audience,
    challenge: Challenge,
    prefix: &'static str,
    router: Router<T>,
    document: OpenApi,
}

impl<T> Api<T> {
    pub(crate) const fn prefix(&self) -> &'static str {
        self.prefix
    }

    pub(crate) const fn document(&self) -> &OpenApi {
        &self.document
    }

    /// The prefix without its leading slash and with hyphens for the remaining slashes.
    pub(crate) fn slug(&self) -> String {
        self.prefix.trim_matches('/').replace('/', "-")
    }
}

impl<T: Clone + Send + Sync + 'static> Api<T> {
    /// The API whose routes read `state`.
    pub(crate) fn with_state(self, state: T) -> Api {
        Api {
            audience: self.audience,
            challenge: self.challenge,
            prefix: self.prefix,
            router: self.router.with_state(state),
            document: self.document,
        }
    }
}

pub(crate) fn apis<S>() -> impl Iterator<Item = Api<ApiState<S>>>
where
    S: StorePool + Send + Sync + 'static,
{
    public::apis::<S>().chain([internal::api()])
}
