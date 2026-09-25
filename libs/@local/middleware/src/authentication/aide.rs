use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{self, Operation, Response},
    transform::TransformOperation,
};
use problematic::Rejection;

use super::{AuthenticationProblem, AuthenticationRejection};
use crate::aide::document_rejection;

/// Documents the responses that the authentication layer can return before a handler runs.
///
/// # Panics
///
/// Panics if the operation already has a response that documents no problem variants at a status
/// this layer answers with.
pub fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    document_rejection::<AuthenticationRejection>(operation)
}

impl OperationOutput for AuthenticationRejection {
    type Inner = Rejection<AuthenticationProblem>;

    fn operation_response(ctx: &mut GenContext, operation: &mut Operation) -> Option<Response> {
        Self::Inner::operation_response(ctx, operation)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<openapi::StatusCode>, Response)> {
        Self::Inner::inferred_responses(ctx, operation)
    }
}
