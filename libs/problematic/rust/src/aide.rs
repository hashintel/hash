use alloc::{string::String, vec::Vec};

use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{MediaType, Operation, Response, SchemaObject, StatusCode},
};
use schemars::JsonSchema;

use crate::ProblemDetails;

impl<E: JsonSchema> OperationOutput for ProblemDetails<'_, E> {
    type Inner = Self;

    fn operation_response(ctx: &mut GenContext, _operation: &mut Operation) -> Option<Response> {
        Some(Response {
            description: String::from("An RFC 9457 problem details document."),
            content: [(
                String::from("application/problem+json"),
                MediaType {
                    schema: Some(SchemaObject {
                        json_schema: ctx.schema.subschema_for::<Self>(),
                        example: None,
                        external_docs: None,
                    }),
                    ..MediaType::default()
                },
            )]
            .into(),
            ..Response::default()
        })
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<StatusCode>, Response)> {
        Self::operation_response(ctx, operation)
            .map(|response| (None, response))
            .into_iter()
            .collect()
    }
}
