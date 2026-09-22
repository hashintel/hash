use aide::{
    OperationOutput,
    generate::{GenContext, in_context},
    openapi::{Operation, ReferenceOr, Response},
    transform::{TransformOperation, TransformResponse},
};
use http::StatusCode;
use problematic::ProblemDetails;
use serde_json::json;

use crate::response::status_problem;

#[cfg(test)]
mod tests;

pub(crate) fn problem_response(
    context: &mut GenContext,
    operation: &mut Operation,
    status: StatusCode,
    description: &str,
) -> Response {
    let mut response = <ProblemDetails<'static>>::operation_response(context, operation)
        .expect("ProblemDetails should document a response");
    let mut transform = TransformResponse::<ProblemDetails<'static>>::new(&mut response)
        .description(description)
        .example(status_problem(status));
    let schema = &mut transform
        .inner()
        .content
        .get_mut("application/problem+json")
        .and_then(|content| content.schema.as_mut())
        .expect("ProblemDetails should document its schema")
        .json_schema;
    if schema.get("$ref").is_none() {
        // An inline schema carries the shared properties, which the constraint must not replace.
        *schema = json!({ "allOf": [schema] })
            .try_into()
            .expect("the composed schema should be an object");
    }
    // Constrain this response without changing the shared ProblemDetails component.
    schema.insert(
        "properties".into(),
        json!({ "status": { "const": status.as_u16(), "examples": [status.as_u16()] } }),
    );
    response
}

pub(crate) fn document_rejection<R: OperationOutput>(
    mut transform: TransformOperation<'_>,
) -> TransformOperation<'_> {
    // Tower layers do not participate in Aide's handler inference.
    in_context(|context| {
        let operation = transform.inner_mut();
        let inferred = R::inferred_responses(context, operation);
        let responses = operation.responses.get_or_insert_with(Default::default);
        for (status, response) in inferred {
            if let Some(status) = status {
                responses
                    .responses
                    .entry(status)
                    .or_insert(ReferenceOr::Item(response));
            } else {
                responses.default.get_or_insert(ReferenceOr::Item(response));
            }
        }
    });
    transform
}
