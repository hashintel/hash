use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{self, Operation, Response},
    transform::TransformOperation,
};
use problematic::Rejection;

use super::{RateLimitProblem, RateLimitRejection};
use crate::aide::document_rejection;

/// Documents the responses that the rate-limit layers can return before a handler runs.
pub fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    document_rejection::<RateLimitRejection>(operation)
}

impl OperationOutput for RateLimitRejection {
    type Inner = Rejection<RateLimitProblem>;

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
