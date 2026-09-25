use core::num::NonZero;

use aide::{
    OperationOutput as _, generate,
    openapi::{Operation, ParameterSchemaOrContent, ReferenceOr, StatusCode},
};
use axum::{body::to_bytes, response::IntoResponse as _};
use http::header::{CONTENT_TYPE, RETRY_AFTER};
use schemars::Schema;
use serde_json::{Value, json};

use crate::rate_limit::{RateLimitRejection, TooManyRequests};

#[tokio::test]
async fn rate_limit_rejection_documents_runtime_response() {
    let retry_after = NonZero::new(17).expect("should use a nonzero retry delay");
    let runtime = TooManyRequests { retry_after }.into_response();
    let status = runtime.status();
    let headers = runtime.headers().clone();
    let body: Value = serde_json::from_slice(
        &to_bytes(runtime.into_body(), usize::MAX)
            .await
            .expect("should read the rejection body"),
    )
    .expect("should deserialize the rejection body");

    assert_eq!(
        body["status"],
        json!(status.as_u16()),
        "the runtime body should carry its response status"
    );
    for extract in [false, true] {
        generate::reset_context();
        generate::extract_schemas(extract);
        generate::in_context(|context| {
            let mut operation = Operation::default();
            let _: Vec<_> = RateLimitRejection::inferred_responses(context, &mut operation);
            let documented = operation
                .responses
                .as_ref()
                .and_then(|responses| responses.responses.get(&StatusCode::Code(status.as_u16())))
                .and_then(ReferenceOr::as_item)
                .expect("should document the runtime HTTP status");
            let content_type = headers
                .get(CONTENT_TYPE)
                .expect("should send a content type")
                .to_str()
                .expect("should send a valid content type");
            let content = documented
                .content
                .get(content_type)
                .expect("should document the runtime media type");
            assert_eq!(
                content.example.as_ref(),
                Some(&body),
                "should document the runtime body as the example"
            );
            let all_of = content
                .schema
                .as_ref()
                .expect("should document the runtime body schema")
                .json_schema
                .as_value()["allOf"]
                .as_array()
                .expect("should compose the documented body schema")
                .clone();
            let [base, problem_type, ..] = all_of.as_slice() else {
                panic!("should compose the shared problem with the problem type");
            };
            assert_eq!(
                problem_type["properties"]["type"]["const"], body["type"],
                "should constrain the documented body to the runtime problem type"
            );
            let base = Schema::try_from(base.clone()).expect("should document a schema object");
            let base = context.resolve_schema(&base).as_value();
            for member in ["type", "title"] {
                assert_eq!(
                    base["properties"][member]["type"], "string",
                    "should preserve the shared problem's {member} schema"
                );
            }

            let retry_header = documented
                .headers
                .get("Retry-After")
                .and_then(ReferenceOr::as_item)
                .expect("should document the retry header inline");
            assert!(
                retry_header.required,
                "should require the runtime retry header"
            );
            let ParameterSchemaOrContent::Schema(retry_schema) = &retry_header.format else {
                panic!("should describe Retry-After using a schema");
            };
            let retry_schema = retry_schema.json_schema.as_value();
            let runtime_delay = headers
                .get(RETRY_AFTER)
                .expect("should send a retry header")
                .to_str()
                .expect("should send a valid retry header")
                .parse::<u64>()
                .expect("should send whole seconds before retrying");
            assert_eq!(
                runtime_delay,
                retry_after.get(),
                "should send the rejection's retry delay"
            );
            assert!(
                runtime_delay
                    >= retry_schema["minimum"]
                        .as_u64()
                        .expect("should set a minimum delay"),
                "should send a delay allowed by the documented header schema"
            );
        });
    }
}
