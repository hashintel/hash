mod credentials;

use aide::{openapi::Info, transform::TransformOpenApi};
use hash_middleware::rate_limit::PrincipalRateLimitConfig;

use self::credentials::{Actor, MaybeActor};
use super::{Api, Audience, caller, documentation, openapi};

pub(super) fn api(rate_limits: PrincipalRateLimitConfig) -> Api {
    openapi::build(
        "/internal",
        Audience::Internal,
        Info {
            title: "Internal".to_owned(),
            version: "unversioned".to_owned(),
            description: Some(documentation::OVERVIEW.to_owned()),
            ..Info::default()
        },
        caller::routes::<Actor, MaybeActor>,
        document,
        rate_limits,
    )
}

fn document(mut document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    for (name, scheme) in credentials::schemes() {
        document = document.security_scheme(name, scheme);
    }
    super::credentials::responses(document.inner_mut());
    super::rate_limit::responses(document.inner_mut());
    document
}
