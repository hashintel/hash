mod credentials;

mod entities;
mod types;

use aide::transform::TransformOpenApi;

use self::credentials::{Actor, MaybeActor};
use super::{Api, rate_limit::PublicRateLimits};

pub(super) fn apis(rate_limits: &PublicRateLimits) -> impl Iterator<Item = Api> {
    entities::api(rate_limits.entities)
        .into_iter()
        .chain(types::api(rate_limits.types))
}

fn document(mut document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    for (name, scheme) in credentials::schemes() {
        document = document.security_scheme(name, scheme);
    }
    super::credentials::responses(document.inner_mut());
    super::rate_limit::responses(document.inner_mut());
    document
}
