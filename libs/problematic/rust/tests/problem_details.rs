extern crate alloc;

use alloc::{borrow::Cow, string::String, vec::Vec};

use problematic::{NoExtensions, ProblemDetails};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
struct InvalidParameters {
    parameters: Vec<String>,
}

/// Typed extensions and occurrence fields survive reading and writing a response document.
#[test]
fn details_typed_extensions() {
    let body = json!({
        "type": "https://example.com/problems/invalid-parameters",
        "title": "Invalid parameters",
        "status": 400,
        "detail": "The limit must be a positive integer.",
        "instance": "https://example.com/problem-occurrences/01J8M6Y7P9",
        "parameters": ["limit"]
    });
    let encoded = serde_json::to_string(&body).expect("the response should serialize");
    let details: ProblemDetails<InvalidParameters> = serde_json::from_str(&encoded)
        .expect("the response should deserialize with typed extensions");
    assert_eq!(
        details.extensions.parameters,
        ["limit"],
        "the extension should retain its typed fields"
    );
    assert_eq!(
        serde_json::to_value(details).expect("the details should serialize"),
        body,
        "the roundtrip should preserve standard fields and flattened extensions"
    );
}

/// Missing occurrence fields remain absent when a response without extensions is read and written.
#[test]
fn details_empty_extensions() {
    let body = json!({"type": "about:blank", "title": "Internal Server Error", "status": 500});
    let encoded = serde_json::to_string(&body).expect("the response should serialize");
    let details: ProblemDetails<NoExtensions> =
        serde_json::from_str(&encoded).expect("the response should deserialize without extensions");
    assert_eq!(
        serde_json::to_value(details).expect("the details should serialize"),
        body,
        "the roundtrip should preserve omitted occurrence fields"
    );
}

/// Flattening preserves required fields of the extension type.
#[test]
fn details_extensions_missing() {
    let body = json!({"type": "about:blank", "title": "Bad Request", "status": 400});
    let error = serde_json::from_value::<ProblemDetails<InvalidParameters>>(body)
        .err()
        .expect("the missing extension field should fail to deserialize");

    assert_eq!(error.to_string(), "missing field `parameters`");
}

/// Both the extension container and its elements retain their declared types.
#[test]
fn details_extensions_invalid_types() {
    for (parameters, expected) in [
        (json!(null), "invalid type: null, expected a sequence"),
        (json!(42), "invalid type: integer `42`, expected a sequence"),
        (json!([42]), "invalid type: integer `42`, expected a string"),
    ] {
        let body = json!({
            "type": "about:blank",
            "title": "Bad Request",
            "status": 400,
            "parameters": parameters
        });
        let error = serde_json::from_value::<ProblemDetails<InvalidParameters>>(body)
            .err()
            .expect("the invalid extension field should fail to deserialize");

        assert_eq!(error.to_string(), expected);
    }
}

/// Scalar and sequence values cannot supply flattened object members.
#[test]
fn details_extensions_non_object_serialize() {
    for extensions in [json!(42), json!("invalid"), json!(["invalid"])] {
        let details = ProblemDetails {
            type_uri: Cow::Borrowed("about:blank"),
            title: Cow::Borrowed("Bad Request"),
            status: 400,
            detail: None,
            instance: None,
            extensions,
        };
        let error = serde_json::to_value(&details)
            .expect_err("the non-object extensions should fail to serialize");

        assert!(
            error
                .to_string()
                .starts_with("can only flatten structs and maps"),
            "the error should identify the unsupported extension shape: {error}"
        );
    }
}

/// Object members cannot be read into a scalar extension type.
#[test]
fn details_extensions_non_object_deserialize() {
    let body = json!({"type": "about:blank", "title": "Bad Request", "status": 400});
    let error = serde_json::from_value::<ProblemDetails<u32>>(body)
        .err()
        .expect("the scalar extension type should fail to deserialize");

    assert_eq!(error.to_string(), "can only flatten structs and maps");
}

#[cfg(feature = "schemars")]
mod schema {
    use problematic::{NoExtensions, ProblemDetails};
    use serde_json::json;

    use super::InvalidParameters;

    macro_rules! assert_schema_snapshot {
        ($type:ty) => {{
            let schema = schemars::schema_for!($type);
            insta::assert_binary_snapshot!(
                ".json",
                serde_json::to_vec_pretty(&schema).expect("the schema should serialize")
            );
        }};
    }

    #[test]
    fn schema_base() {
        assert_schema_snapshot!(ProblemDetails<NoExtensions>);
    }

    #[test]
    fn schema_typed_extensions() {
        assert_schema_snapshot!(ProblemDetails<InvalidParameters>);
    }

    #[test]
    fn schema_occurrence_members() {
        let schema = schemars::schema_for!(ProblemDetails<NoExtensions>).to_value();
        let minimal =
            json!({"type": "about:blank", "title": "Internal Server Error", "status": 500});
        let details: ProblemDetails<NoExtensions> =
            serde_json::from_value(minimal).expect("the minimal response should deserialize");
        let minimal = serde_json::to_value(details).expect("the details should serialize");
        let required = schema["required"]
            .as_array()
            .expect("the response schema should declare required members");
        let members = minimal
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
