use aide::{OperationOutput as _, generate, openapi::Operation};
use problematic::ProblemDetails;
use schemars::JsonSchema;

#[derive(JsonSchema)]
#[expect(
    dead_code,
    reason = "The test generates schemas without constructing extension values."
)]
struct Extensions {
    parameter: String,
}

#[test]
fn problem_details_infers_default_response() {
    generate::reset_context();
    generate::in_context(|context| {
        let responses = ProblemDetails::<'_, Extensions>::inferred_responses(
            context,
            &mut Operation::default(),
        );
        let [(status, response)] = responses.as_slice() else {
            panic!("should infer one response");
        };
        assert_eq!(*status, None, "should infer the default response");

        let schema = &response
            .content
            .get("application/problem+json")
            .expect("should advertise the problem media type")
            .schema
            .as_ref()
            .expect("should document a problem details schema")
            .json_schema;
        let schema = context.resolve_schema(schema).as_value();
        for member in ["status", "parameter"] {
            assert!(
                schema["properties"].get(member).is_some(),
                "should document {member}"
            );
        }
    });
}
