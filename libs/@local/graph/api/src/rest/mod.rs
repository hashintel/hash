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
mod state;
pub mod telemetry;

#[cfg(test)]
pub(crate) mod test_utils;

use aide::openapi::OpenApi;
use axum::Router;
use hash_graph_store::pool::StorePool;
use hash_middleware::authentication::Challenge;

pub(crate) use self::state::ApiState;
pub use self::{
    public::PublicApiConfig,
    router::{Dependencies, router},
};

/// The callers an API admits, which selects the provider chain authenticating its requests.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Audience {
    /// Callers presenting an API token. A request without one is answered `401`.
    Public,
    /// Callers presenting a Kratos session. A request without one is served anonymously, one
    /// presenting an API token is answered `401`.
    Internal,
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
