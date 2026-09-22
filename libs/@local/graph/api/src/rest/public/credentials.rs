use aide::{
    OperationInput,
    generate::GenContext,
    openapi::{Operation, SecurityScheme},
    transform::TransformOperation,
};

use crate::rest::{
    Audience,
    credentials::{self, CLOUDFLARE_ACCESS, DELEGATED_ACTOR, SERVICE_SECRET},
};

pub(super) struct Credentials;

impl credentials::Credentials for Credentials {
    const AUDIENCE: Audience = Audience::Public;

    fn schemes() -> impl IntoIterator<Item = (&'static str, SecurityScheme)> {
        credentials::shared_schemes()
    }
}

impl OperationInput for Credentials {
    fn operation_input(_ctx: &mut GenContext, operation: &mut Operation) {
        let _: TransformOperation<'_> = TransformOperation::new(operation)
            .security_requirement(CLOUDFLARE_ACCESS)
            .security_requirement_multi([SERVICE_SECRET, DELEGATED_ACTOR]);
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
