use aide::{
    OperationInput,
    generate::GenContext,
    openapi::{Operation, SecurityScheme},
    transform::TransformOperation,
};

use crate::rest::credentials::{self, CLOUDFLARE_ACCESS, DELEGATED_ACTOR, SERVICE_SECRET};

pub(super) struct Credentials;

pub(super) type Actor = credentials::Actor<Credentials>;
pub(super) type MaybeActor = credentials::MaybeActor<Credentials>;

pub(super) fn schemes() -> [(&'static str, SecurityScheme); 3] {
    credentials::shared_schemes()
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
    use super::{Actor, MaybeActor};
    use crate::rest::{Audience, test_utils::assert_authentication};

    #[tokio::test]
    async fn caller_authentication() {
        assert_authentication::<Actor, MaybeActor>(Audience::Public).await;
    }
}
