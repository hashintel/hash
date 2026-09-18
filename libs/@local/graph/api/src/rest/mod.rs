pub mod authentication;
mod caller;
mod credentials;
mod documentation;
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
use hash_middleware::rate_limit::PrincipalRateLimitConfig;

pub(crate) use self::rate_limit::RateLimits;
pub use self::router::{Dependencies, router};

pub(crate) enum Audience {
    Public,
    Internal,
}

pub(crate) struct Api {
    pub audience: Audience,
    pub rate_limits: PrincipalRateLimitConfig,
    pub prefix: &'static str,
    pub router: Router,
    pub document: OpenApi,
}

pub(crate) fn apis(rate_limits: &RateLimits) -> Vec<Api> {
    public::apis(&rate_limits.public)
        .chain([internal::api(rate_limits.internal)])
        .collect()
}
