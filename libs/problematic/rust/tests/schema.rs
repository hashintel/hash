use problematic::ProblemDetails;
use schemars::generate::SchemaSettings;
use serde::Deserialize as _;
use serde_json::json;

#[test]
fn schema_base() {
    let schema = schemars::schema_for!(ProblemDetails<'_>);
    insta::assert_binary_snapshot!(
        ".json",
        serde_json::to_vec_pretty(&schema).expect("the schema should serialize")
    );
}

#[test]
fn schema_occurrence_members() {
    let input = json!({"title": "Internal Server Error", "status": 500});
    let details = ProblemDetails::<'_, ()>::deserialize(input.clone())
        .expect("the minimal response should deserialize");
    let output = serde_json::to_value(details).expect("the details should serialize");
    for (settings, document) in [
        (SchemaSettings::default(), input),
        (SchemaSettings::default().for_serialize(), output),
    ] {
        let schema = settings
            .into_generator()
            .into_root_schema_for::<ProblemDetails<'_>>()
            .to_value();
        let required = schema["required"]
            .as_array()
            .expect("the response schema should declare required members");
        let members = document
            .as_object()
            .expect("the response should be an object");
        assert_eq!(required.len(), members.len());
        for name in members.keys() {
            assert!(required.contains(&json!(name)));
        }

        for name in ["detail", "instance"] {
            assert!(!required.contains(&json!(name)));
            assert_eq!(schema["properties"][name]["type"], "string");
        }
    }
}
