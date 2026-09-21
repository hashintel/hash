use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{self, Operation, Response},
    transform::TransformOperation,
};
use http::StatusCode;
use problematic::ProblemDetails;

use super::AuthenticationRejection;
use crate::aide::{document_rejection, problem_response};

/// Documents the responses that the authentication layer can return before a handler runs.
pub fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    document_rejection::<AuthenticationRejection>(operation)
}

impl OperationOutput for AuthenticationRejection {
    type Inner = ProblemDetails<'static>;

    fn operation_response(ctx: &mut GenContext, operation: &mut Operation) -> Option<Response> {
        Self::Inner::operation_response(ctx, operation)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<openapi::StatusCode>, Response)> {
        [
            (
                StatusCode::BAD_REQUEST,
                "Malformed credentials or actor header.",
            ),
            (
                StatusCode::UNAUTHORIZED,
                "The credentials cannot resolve to a permitted caller.",
            ),
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "An internal error prevented the request from completing.",
            ),
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The credential provider or actor store is unavailable.",
            ),
        ]
        .into_iter()
        .map(|(status, description)| {
            (
                Some(openapi::StatusCode::Code(status.as_u16())),
                problem_response(ctx, operation, status, description),
            )
        })
        .collect()
    }
}
