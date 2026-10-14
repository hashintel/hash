use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{self, Operation, ReferenceOr, Response},
    transform::TransformOperation,
};
use http::header::WWW_AUTHENTICATE;
use problematic::Rejection;

use super::{
    AuthenticationProblem, AuthenticationRejection, Challenge,
    problem::UndelegatedAuthenticationProblem,
};
use crate::aide::document_rejection;

/// Documents the responses that a layer challenging with `challenge` can return before a handler
/// runs.
///
/// Only service delegation names an actor in a header, so the `400` for a malformed actor header
/// is documented for [`Challenge::Service`] alone.
///
/// # Panics
///
/// Panics if the operation already has a response that documents no problem variants at a status
/// this layer answers with.
pub fn document(operation: TransformOperation<'_>, challenge: Challenge) -> TransformOperation<'_> {
    let mut operation = match challenge {
        Challenge::Service => document_rejection::<AuthenticationRejection>(operation),
        Challenge::Bearer | Challenge::Session => {
            document_rejection::<Rejection<UndelegatedAuthenticationProblem>>(operation)
        }
    };
    let challenge_header = operation
        .inner_mut()
        .responses
        .as_mut()
        .and_then(|responses| responses.responses.get_mut(&openapi::StatusCode::Code(401)))
        .and_then(ReferenceOr::as_item_mut)
        .and_then(|response| {
            response
                .headers
                .iter_mut()
                .find(|(name, _)| name.eq_ignore_ascii_case(WWW_AUTHENTICATE.as_str()))
        })
        .and_then(|(_, header)| header.as_item_mut());
    if let Some(header) = challenge_header {
        header.description = Some(challenge.description());
    }
    operation
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
