//! The OpenAPI response clauses that more than one route states.
//!
//! A documented response is part of the contract, so two routes that answer one problem the same
//! way state it from one place. Divergent wording for an identical refusal reads as a difference
//! the server does not have. Each helper transforms one operation and composes through aide's
//! `with`, which keeps a route's documentation one chain naming the clauses it states. A clause
//! only one route answers stays in that route's own module.

use aide::{openapi, transform::TransformOperation};

use super::problem::Problem;

/// States the `401` every authority-bearing route answers alike.
///
/// One uniform refusal covers every cause, so the documented remedy is all a caller learns from it.
pub(super) fn unauthorized(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.response_with::<401, Problem<'static>, _>(|response| {
        response.description("`unauthorized`: no valid authority token; re-fetch the manifest")
    })
}

/// States the `422` every body-bearing route answers alike.
///
/// The body extractor keeps the framework's own status, so well-formed JSON that is not the
/// operation's shape - a mistyped member or an unknown one - answers `invalid-body` at 422,
/// while a body that is not JSON at all answers it at 400.
pub(super) fn invalid_body_data(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.response_with::<422, Problem<'static>, _>(|response| {
        response.description(
            "`invalid-body`: well-formed JSON that is not this operation's shape - a mistyped \
             member or an unknown one",
        )
    })
}

/// States the catch-all clause covering what the enumerated responses do not.
pub(super) fn any_problem(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.default_response_with::<Problem<'static>, _>(|response| {
        response.description("any other problem document; `internal` marks a server-side failure")
    })
}

/// Marks the operation's request body optional.
///
/// A declared body documents as required, including the `Option<Body<_>>` a route reading an absent
/// body as the all-defaults request accepts.
pub(super) fn optional_body(mut operation: TransformOperation<'_>) -> TransformOperation<'_> {
    if let Some(body) = body_mut(&mut operation) {
        body.required = false;
    }

    operation
}

/// Describes the operation's request body, naming what the body is for.
pub(super) fn describe_body(
    description: &'static str,
) -> impl FnOnce(TransformOperation<'_>) -> TransformOperation<'_> {
    move |mut operation| {
        if let Some(body) = body_mut(&mut operation) {
            body.description = Some(description.to_owned());
        }

        operation
    }
}

/// The operation's declared request body, when it declares one inline.
///
/// A body reaching the document as a component reference carries no per-operation text to edit, so
/// there is nothing to describe and nothing to mark.
fn body_mut<'body>(
    operation: &'body mut TransformOperation<'_>,
) -> Option<&'body mut openapi::RequestBody> {
    operation.inner_mut().request_body.as_mut()?.as_item_mut()
}
