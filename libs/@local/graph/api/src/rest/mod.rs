pub mod authentication;
mod caller;
mod credentials;
mod documentation;
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        unused_imports,
        reason = "only the tests read requests through these extractors"
    )
)]
mod extract;
mod internal;
pub mod legacy;
mod middleware;
mod openapi;
pub mod probe;
mod public;
pub mod rate_limit;
mod router;
pub mod telemetry;

#[cfg(test)]
pub(crate) mod test_utils;

use aide::openapi::OpenApi;
use axum::Router;

pub use self::router::{Dependencies, router};

/// The callers an API admits, which selects the provider chain authenticating its requests.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Audience {
    Public,
    Internal,
}

/// An API's routes, nested under its prefix, with the document describing them.
pub(crate) struct Api {
    audience: Audience,
    prefix: &'static str,
    router: Router,
    document: OpenApi,
}

impl Api {
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

pub(crate) fn apis() -> impl Iterator<Item = Api> {
    public::apis().chain([internal::api()])
}
