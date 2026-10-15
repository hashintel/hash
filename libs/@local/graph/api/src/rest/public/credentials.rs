use aide::{
    OperationInput,
    generate::GenContext,
    openapi::{Operation, SecurityScheme},
    transform::TransformOperation,
};
use hash_middleware::authentication::Challenge;

use crate::rest::{
    Audience,
    credentials::{self, API_TOKEN},
};

pub(super) struct Credentials;

impl credentials::Credentials for Credentials {
    const AUDIENCE: Audience = Audience::Public;
    const CHALLENGE: Challenge = Challenge::Bearer;

    fn schemes() -> impl IntoIterator<Item = (&'static str, SecurityScheme)> {
        [(API_TOKEN, credentials::api_token_scheme())]
    }
}

impl OperationInput for Credentials {
    fn operation_input(_ctx: &mut GenContext, operation: &mut Operation) {
        let _: TransformOperation<'_> =
            TransformOperation::new(operation).security_requirement(API_TOKEN);
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
