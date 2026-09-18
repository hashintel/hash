use aide::{
    OperationInput,
    generate::GenContext,
    openapi::{ApiKeyLocation, Operation, SecurityScheme},
    transform::TransformOperation,
};
use hash_graph_authentication::kratos::{SESSION_COOKIE_NAME, SESSION_TOKEN_HEADER};

use crate::rest::credentials::{self, CLOUDFLARE_ACCESS, DELEGATED_ACTOR, SERVICE_SECRET};

const SESSION_TOKEN: &str = "sessionToken";
const SESSION_COOKIE: &str = "sessionCookie";

pub(super) struct Credentials;

pub(super) type Actor = credentials::Actor<Credentials>;
pub(super) type MaybeActor = credentials::MaybeActor<Credentials>;

pub(super) fn schemes() -> impl Iterator<Item = (&'static str, SecurityScheme)> {
    [
        (
            SESSION_TOKEN,
            credentials::api_key(
                ApiKeyLocation::Header,
                SESSION_TOKEN_HEADER,
                "Kratos session token.",
            ),
        ),
        (
            SESSION_COOKIE,
            credentials::api_key(
                ApiKeyLocation::Cookie,
                SESSION_COOKIE_NAME,
                "Kratos browser session.",
            ),
        ),
    ]
    .into_iter()
    .chain(credentials::shared_schemes())
}

impl OperationInput for Credentials {
    fn operation_input(_ctx: &mut GenContext, operation: &mut Operation) {
        let _: TransformOperation<'_> = TransformOperation::new(operation)
            .security_requirement(SESSION_TOKEN)
            .security_requirement(SESSION_COOKIE)
            .security_requirement(CLOUDFLARE_ACCESS)
            .security_requirement_multi([SERVICE_SECRET, DELEGATED_ACTOR]);
    }
}

#[cfg(test)]
mod tests {
    use super::{Actor, MaybeActor};
    use crate::rest::{Audience, test_utils::assert_authentication};

    #[tokio::test]
    async fn caller_authentication() {
        assert_authentication::<Actor, MaybeActor>(Audience::Internal).await;
    }
}
