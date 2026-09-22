use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{
        self, Header, HeaderStyle, Operation, ParameterSchemaOrContent, ReferenceOr, Response,
        SchemaObject,
    },
    transform::{TransformOperation, TransformResponse},
};
use http::StatusCode;
use problematic::ProblemDetails;
use serde_json::json;

use super::{RateLimitRejection, TooManyRequests};
use crate::aide::{document_rejection, problem_response};

/// Documents the responses that the rate-limit layers can return before a handler runs.
pub fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    document_rejection::<RateLimitRejection>(operation)
}

impl OperationOutput for TooManyRequests {
    type Inner = ProblemDetails<'static>;

    fn operation_response(ctx: &mut GenContext, operation: &mut Operation) -> Option<Response> {
        let mut response = problem_response(
            ctx,
            operation,
            StatusCode::TOO_MANY_REQUESTS,
            "The request exceeded its rate-limit budget.",
        );
        TransformResponse::<Self::Inner>::new(&mut response)
            .inner()
            .headers
            .insert(
                "Retry-After".to_owned(),
                ReferenceOr::Item(Header {
                    description: Some("Whole seconds before retrying the request.".to_owned()),
                    style: HeaderStyle::Simple,
                    required: true,
                    deprecated: None,
                    format: ParameterSchemaOrContent::Schema(SchemaObject {
                        json_schema: json!({ "type": "integer", "minimum": 1 })
                            .try_into()
                            .expect("the Retry-After schema should be an object"),
                        example: None,
                        external_docs: None,
                    }),
                    example: None,
                    examples: [].into(),
                    extensions: [].into(),
                }),
            );
        Some(response)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<openapi::StatusCode>, Response)> {
        Self::operation_response(ctx, operation)
            .map(|response| (Some(openapi::StatusCode::Code(429)), response))
            .into_iter()
            .collect()
    }
}

impl OperationOutput for RateLimitRejection {
    type Inner = ProblemDetails<'static>;

    fn operation_response(ctx: &mut GenContext, operation: &mut Operation) -> Option<Response> {
        Self::Inner::operation_response(ctx, operation)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<openapi::StatusCode>, Response)> {
        let mut responses = TooManyRequests::inferred_responses(ctx, operation);
        responses.push((
            Some(openapi::StatusCode::Code(500)),
            problem_response(
                ctx,
                operation,
                StatusCode::INTERNAL_SERVER_ERROR,
                "An internal error prevented the request from completing.",
            ),
        ));
        responses
    }
}
