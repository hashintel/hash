extern crate alloc;

use alloc::{borrow::Cow, string::String, vec::Vec};

use http::StatusCode;
use problematic::{NoExtensions, ProblemDetails, ProblemType};
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
    let details: ProblemDetails<'_, InvalidParameters> = serde_json::from_str(&encoded)
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
    let details: ProblemDetails<'_, NoExtensions> =
        serde_json::from_str(&encoded).expect("the response should deserialize without extensions");
    assert_eq!(
        serde_json::to_value(details).expect("the details should serialize"),
        body,
        "the roundtrip should preserve omitted occurrence fields"
    );
}

/// Metadata and occurrence strings can be borrowed from values constructed at runtime.
#[test]
fn details_borrowed_fields() {
    let type_uri = String::from("https://example.com/problems/invalid-parameters");
    let title = String::from("Invalid parameters");
    let detail = String::from("The limit must be a positive integer.");
    let instance = String::from("https://example.com/problem-occurrences/01J8M6Y7P9");
    let details = ProblemDetails {
        type_uri: Cow::Borrowed(&type_uri),
        title: Cow::Borrowed(&title),
        status: 400,
        detail: Some(Cow::Borrowed(&detail)),
        instance: Some(Cow::Borrowed(&instance)),
        extensions: NoExtensions {},
    };

    assert_eq!(
        serde_json::to_value(&details).expect("the borrowed details should serialize"),
        json!({
            "type": type_uri,
            "title": title,
            "status": 400,
            "detail": detail,
            "instance": instance
        }),
        "the borrowed fields should retain their contents"
    );
}

/// Static metadata and locally borrowed occurrence strings share one lifetime without copying.
#[test]
fn details_static_metadata() {
    const INVALID_PARAMETERS: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameters"),
        title: Cow::Borrowed("Invalid parameters"),
        status: StatusCode::BAD_REQUEST,
    };

    let detail = String::from("The limit must be a positive integer.");
    let instance = String::from("https://example.com/problem-occurrences/01J8M6Y7P9");
    let details = ProblemDetails {
        type_uri: INVALID_PARAMETERS.type_uri.clone(),
        title: INVALID_PARAMETERS.title.clone(),
        status: INVALID_PARAMETERS.status.as_u16(),
        detail: Some(Cow::Borrowed(&detail)),
        instance: Some(Cow::Borrowed(&instance)),
        extensions: NoExtensions {},
    };

    assert_eq!(
        serde_json::to_value(&details).expect("the mixed-lifetime details should serialize"),
        json!({
            "type": "https://example.com/problems/invalid-parameters",
            "title": "Invalid parameters",
            "status": 400,
            "detail": detail,
            "instance": instance
        }),
        "the static and local fields should retain their contents"
    );
}

/// Deserialization owns standard strings and supports APIs requiring `DeserializeOwned`.
#[test]
fn details_owned_deserialize() {
    let body = json!({
        "type": "https://example.com/problems/invalid-parameters",
        "title": "Invalid parameters",
        "status": 400,
        "detail": "The limit must be a positive integer.",
        "instance": "https://example.com/problem-occurrences/01J8M6Y7P9"
    });
    let encoded = serde_json::to_string(&body).expect("the response should serialize");
    let from_string: ProblemDetails<'static, NoExtensions> =
        serde_json::from_str(&encoded).expect("the response should deserialize from a string");
    let from_value: ProblemDetails<'static, NoExtensions> =
        serde_json::from_value(body.clone()).expect("the response should deserialize from a value");
    let from_reader: ProblemDetails<'static, NoExtensions> =
        serde_json::from_reader(encoded.as_bytes())
            .expect("the response should deserialize from a reader");
    drop(encoded);

    for details in [from_string, from_value, from_reader] {
        assert!(
            matches!(details.type_uri, Cow::Owned(_))
                && matches!(details.title, Cow::Owned(_))
                && matches!(details.detail, Some(Cow::Owned(_)))
                && matches!(details.instance, Some(Cow::Owned(_))),
            "the deserialized strings should be owned"
        );
        assert_eq!(
            serde_json::to_value(details).expect("the owned details should serialize"),
            body,
            "the owned fields should retain their contents"
        );
    }
}

/// Flattening preserves required fields of the extension type.
#[test]
fn details_extensions_missing() {
    let body = json!({"type": "about:blank", "title": "Bad Request", "status": 400});
    let error = serde_json::from_value::<ProblemDetails<'_, InvalidParameters>>(body)
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
        let error = serde_json::from_value::<ProblemDetails<'_, InvalidParameters>>(body)
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

        assert_eq!(
            error.to_string(),
            "problem extensions must serialize as an object",
            "the error should identify the unsupported extension shape"
        );
    }
}

/// Object members cannot be read into a scalar extension type.
#[test]
fn details_extensions_non_object_deserialize() {
    let body = json!({"type": "about:blank", "title": "Bad Request", "status": 400});
    let error = serde_json::from_value::<ProblemDetails<'_, u32>>(body)
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
        assert_schema_snapshot!(ProblemDetails<'_, NoExtensions>);
    }

    #[test]
    fn schema_typed_extensions() {
        assert_schema_snapshot!(ProblemDetails<'_, InvalidParameters>);
    }

    #[test]
    fn schema_occurrence_members() {
        let schema = schemars::schema_for!(ProblemDetails<'_, NoExtensions>).to_value();
        let minimal =
            json!({"type": "about:blank", "title": "Internal Server Error", "status": 500});
        let details: ProblemDetails<'_, NoExtensions> =
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
