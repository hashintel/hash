use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{
        self, Header, HeaderStyle, Operation, ParameterSchemaOrContent, ReferenceOr, Response,
        SchemaObject,
    },
    transform::TransformOperation,
};
use problematic::Rejection;

use super::{
    RATELIMIT, RATELIMIT_DESCRIPTION, RATELIMIT_POLICY, RATELIMIT_POLICY_DESCRIPTION,
    RateLimitProblem, RateLimitRejection,
};
use crate::aide::document_rejection;

/// Documents the responses that the rate-limit layers can return before a handler runs, and,
/// through [`document_fields`], the `RateLimit-Policy` and `RateLimit` fields on its responses.
///
/// # Panics
///
/// Panics if the operation already has a response that documents no problem variants at a status
/// these layers answer with.
pub fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    let mut operation = document_rejection::<RateLimitRejection>(operation);
    document_fields(operation.inner_mut());
    operation
}

/// Documents the `RateLimit-Policy` and `RateLimit` fields on every inline response `operation` has
/// when this runs, unless that response documents either field.
///
/// Apply it after the operation's own responses. A response carries the fields when the rate-limit
/// layers enforce their budgets and checked the request against one.
pub fn document_fields(operation: &mut Operation) {
    let Some(responses) = &mut operation.responses else {
        return;
    };
    for response in responses
        .default
        .iter_mut()
        .chain(responses.responses.values_mut())
        .filter_map(ReferenceOr::as_item_mut)
    {
        if response.headers.keys().any(|name| {
            name.eq_ignore_ascii_case(RATELIMIT_POLICY.as_str())
                || name.eq_ignore_ascii_case(RATELIMIT.as_str())
        }) {
            continue;
        }
        response.headers.insert(
            "RateLimit-Policy".to_owned(),
            field(RATELIMIT_POLICY_DESCRIPTION, r#""actor";q=500;w=50"#),
        );
        response.headers.insert(
            "RateLimit".to_owned(),
            field(RATELIMIT_DESCRIPTION, r#""actor";r=499"#),
        );
    }
}

/// An optional structured field with `description`, shown with `example`.
#[expect(
    clippy::default_trait_access,
    reason = "the example and extension maps are `indexmap` types, which this crate does not \
              depend on"
)]
fn field(description: &str, example: &str) -> ReferenceOr<Header> {
    ReferenceOr::Item(Header {
        description: Some(description.to_owned()),
        style: HeaderStyle::Simple,
        required: false,
        deprecated: None,
        format: ParameterSchemaOrContent::Schema(SchemaObject {
            json_schema: schemars::json_schema!({"type": "string"}),
            example: None,
            external_docs: None,
        }),
        example: Some(serde_json::Value::String(example.to_owned())),
        examples: Default::default(),
        extensions: Default::default(),
    })
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
