use aide::{
    OperationInput,
    generate::GenContext,
    openapi::{ApiKeyLocation, Operation, SecurityScheme},
    transform::TransformOperation,
};
use hash_graph_authentication::kratos::{SESSION_COOKIE_NAME, SESSION_TOKEN_HEADER};
use hash_middleware::authentication::Challenge;

use crate::rest::{Audience, credentials};

const SESSION_TOKEN: &str = "sessionToken";
const SESSION_COOKIE: &str = "sessionCookie";

pub(super) struct Credentials;

impl credentials::Credentials for Credentials {
    const AUDIENCE: Audience = Audience::Internal;
    const CHALLENGE: Challenge = Challenge::Session;

    fn schemes() -> impl IntoIterator<Item = (&'static str, SecurityScheme)> {
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
    }
}

impl OperationInput for Credentials {
    fn operation_input(_ctx: &mut GenContext, operation: &mut Operation) {
        let _: TransformOperation<'_> = TransformOperation::new(operation)
            .security_requirement(SESSION_TOKEN)
            .security_requirement(SESSION_COOKIE);
    }
}

#[cfg(test)]
mod tests {
    use super::Credentials;
    use crate::rest::test_utils::assert_authentication;

    #[tokio::test]
    async fn credentials_resolve_callers() {
        assert_authentication::<Credentials>().await;
    }
}
