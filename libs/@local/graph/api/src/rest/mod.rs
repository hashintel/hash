mod caller;
mod credentials;
pub(crate) mod documentation;
mod internal;
mod openapi;
mod public;
mod rate_limit;

#[cfg(test)]
pub(crate) mod test_utils;

use aide::openapi::OpenApi;
use axum::Router;
use hash_middleware::rate_limit::PrincipalRateLimitConfig;

pub(crate) use self::rate_limit::RateLimits;

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
