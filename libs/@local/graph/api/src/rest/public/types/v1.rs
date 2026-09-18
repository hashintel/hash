use aide::openapi::Info;
use hash_middleware::rate_limit::PrincipalRateLimitConfig;

use crate::rest::{Api, Audience, caller, documentation, openapi, public};

pub(super) fn api(rate_limits: PrincipalRateLimitConfig) -> Api {
    openapi::build(
        "/types/v1",
        Audience::Public,
        Info {
            title: "Types".to_owned(),
            version: "1".to_owned(),
            description: Some(documentation::OVERVIEW.to_owned()),
            ..Info::default()
        },
        caller::routes::<public::Actor, public::MaybeActor>,
        public::document,
        rate_limits,
    )
}
