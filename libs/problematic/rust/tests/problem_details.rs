extern crate alloc;

use alloc::{borrow::Cow, string::String, vec::Vec};
use core::{assert_matches, ptr};

use problematic::{NoExtensions, ProblemDetails, ProblemType, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Serialize, Deserialize)]
struct InvalidParameters {
    parameters: Vec<String>,
}

#[test]
fn details_typed_extensions() {
    let body = json!({
        "type": "https://example.com/problems/invalid-parameters",
        "title": "Invalid parameters",
        "status": 400,
        "detail": "The limit must be a positive integer.",
        "instance": "https://example.com/problem-occurrences/42",
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

#[test]
fn details_default_type() {
    let encoded = r#"{"title":"Internal Server Error","status":500}"#;
    let details: ProblemDetails<'_, NoExtensions> =
        serde_json::from_str(encoded).expect("the response should deserialize without a type");

    assert_matches!(details.type_uri, Cow::Borrowed("about:blank"));
    assert_eq!(
        serde_json::to_value(details).expect("the details should serialize"),
        json!({"type": "about:blank", "title": "Internal Server Error", "status": 500})
    );
}

#[test]
fn details_invalid_type() {
    for (type_uri, expected) in [
        (json!(null), "invalid type: null, expected a string"),
        (json!(42), "invalid type: number, expected a string"),
    ] {
        let body = json!({"type": type_uri, "title": "Internal Server Error", "status": 500});
        let error = ProblemDetails::<'_, NoExtensions>::deserialize(body)
            .expect_err("the non-string type should fail to deserialize");

        assert_eq!(error.to_string(), expected);
    }
}

#[test]
fn details_borrowed_fields() {
    let type_uri = String::from("https://example.com/problems/invalid-parameters");
    let title = String::from("Invalid parameters");
    let detail = String::from("The limit must be a positive integer.");
    let instance = String::from("https://example.com/problem-occurrences/42");
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

#[test]
fn details_static_metadata() {
    const INVALID_PARAMETERS: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameters"),
        title: Cow::Borrowed("Invalid parameters"),
        status: StatusCode::BAD_REQUEST,
    };

    let detail = String::from("The limit must be a positive integer.");
    let instance = String::from("https://example.com/problem-occurrences/42");
    let details = INVALID_PARAMETERS.detail(&detail).instance(&instance);

    assert_matches!(
        details,
        ProblemDetails {
            type_uri: Cow::Borrowed(_),
            title: Cow::Borrowed(_),
            ..
        },
        "the metadata should be borrowed from the definition"
    );
    assert_matches!(
        details.detail, Some(Cow::Borrowed(value)) if ptr::eq(value, detail.as_str()),
        "the detail should borrow the original string"
    );
    assert_matches!(
        details.instance, Some(Cow::Borrowed(value)) if ptr::eq(value, instance.as_str()),
        "the instance should borrow the original string"
    );
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

#[test]
fn details_borrowed_deserialize() {
    let body = json!({
        "type": "https://example.com/problems/invalid-parameters",
        "title": "Invalid parameters",
        "status": 400,
        "detail": "The limit must be a positive integer.",
        "instance": "https://example.com/problem-occurrences/42"
    });
    let encoded = serde_json::to_string(&body).expect("the response should serialize");
    let from_string: ProblemDetails<'_, NoExtensions> =
        serde_json::from_str(&encoded).expect("the response should deserialize from a string");
    let from_slice: ProblemDetails<'_, NoExtensions> = serde_json::from_slice(encoded.as_bytes())
        .expect("the response should deserialize from a byte slice");

    for details in [from_string, from_slice] {
        assert_matches!(
            details,
            ProblemDetails {
                type_uri: Cow::Borrowed(_),
                title: Cow::Borrowed(_),
                detail: Some(Cow::Borrowed(_)),
                instance: Some(Cow::Borrowed(_)),
                ..
            },
            "the strings should be borrowed from the input"
        );
        for text in [
            details.type_uri.as_ref(),
            details.title.as_ref(),
            details
                .detail
                .as_deref()
                .expect("the response should contain a detail"),
            details
                .instance
                .as_deref()
                .expect("the response should contain an instance"),
        ] {
            assert!(
                encoded.as_bytes().as_ptr_range().contains(&text.as_ptr()),
                "the borrowed string should point into the original JSON buffer"
            );
        }
        assert_eq!(
            serde_json::to_value(details).expect("the borrowed details should serialize"),
            body,
            "the borrowed fields should retain their contents"
        );
    }
}

#[test]
fn details_escaped_deserialize() {
    let encoded = r#"{
        "type": "https:\/\/example.com/problems/invalid-parameters",
        "title": "Invalid \u0070arameters",
        "status": 400,
        "detail": "The limit must be a positive \u0069nteger.",
        "instance": "https:\/\/example.com/problem-occurrences/42"
    }"#;
    let body = json!({
        "type": "https://example.com/problems/invalid-parameters",
        "title": "Invalid parameters",
        "status": 400,
        "detail": "The limit must be a positive integer.",
        "instance": "https://example.com/problem-occurrences/42"
    });
    let details: ProblemDetails<'_, NoExtensions> =
        serde_json::from_str(encoded).expect("the escaped response should deserialize");

    assert_matches!(
        details,
        ProblemDetails {
            type_uri: Cow::Owned(_),
            title: Cow::Owned(_),
            detail: Some(Cow::Owned(_)),
            instance: Some(Cow::Owned(_)),
            ..
        },
        "the decoded strings should be owned"
    );
    assert_eq!(
        serde_json::to_value(details).expect("the decoded details should serialize"),
        body,
        "the decoded fields should retain their contents"
    );
}

#[test]
fn details_owned_deserialize() {
    let body = json!({
        "type": "https://example.com/problems/invalid-parameters",
        "title": "Invalid parameters",
        "status": 400,
        "detail": "The limit must be a positive integer.",
        "instance": "https://example.com/problem-occurrences/42"
    });
    let encoded = serde_json::to_string(&body).expect("the response should serialize");
    let from_value: ProblemDetails<'static, NoExtensions> =
        ProblemDetails::deserialize(body.clone())
            .expect("the response should deserialize from a value");
    let mut deserializer = serde_json::Deserializer::from_reader(encoded.as_bytes());
    let from_reader: ProblemDetails<'static, NoExtensions> =
        ProblemDetails::deserialize(&mut deserializer)
            .expect("the response should deserialize from a reader");
    deserializer
        .end()
        .expect("the reader should contain a single response");
    drop(encoded);

    for details in [from_value, from_reader] {
        assert_matches!(
            details,
            ProblemDetails {
                type_uri: Cow::Owned(_),
                title: Cow::Owned(_),
                detail: Some(Cow::Owned(_)),
                instance: Some(Cow::Owned(_)),
                ..
            },
            "the deserialized strings should be owned"
        );
        assert_eq!(
            serde_json::to_value(details).expect("the owned details should serialize"),
            body,
            "the owned fields should retain their contents"
        );
    }
}

#[test]
fn details_null_occurrence_fields() {
    let details: ProblemDetails<'_, NoExtensions> = ProblemDetails::deserialize(json!({
        "type": "about:blank",
        "title": "Bad Request",
        "status": 400,
        "detail": null,
        "instance": null
    }))
    .expect("the null occurrence fields should deserialize");

    assert!(
        details.detail.is_none() && details.instance.is_none(),
        "the null occurrence fields should be absent"
    );
    assert_eq!(
        serde_json::to_value(details).expect("the details should serialize"),
        json!({"type": "about:blank", "title": "Bad Request", "status": 400}),
        "the absent occurrence fields should be omitted"
    );
}

#[test]
fn details_invalid_occurrence_fields() {
    for name in ["detail", "instance"] {
        let error = ProblemDetails::<'_, NoExtensions>::deserialize(json!({
            "type": "about:blank",
            "title": "Bad Request",
            "status": 400,
            name: 42
        }))
        .expect_err("the non-string occurrence field should fail to deserialize");

        assert_eq!(
            error.to_string(),
            "invalid type: number, expected a string",
            "the error should identify the unsupported occurrence field type"
        );
    }
}

#[test]
fn details_extensions_missing() {
    let body = json!({"type": "about:blank", "title": "Bad Request", "status": 400});
    let error = ProblemDetails::<'_, InvalidParameters>::deserialize(body)
        .err()
        .expect("the missing extension field should fail to deserialize");

    assert_eq!(error.to_string(), "missing field `parameters`");
}

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
        let error = ProblemDetails::<'_, InvalidParameters>::deserialize(body)
            .err()
            .expect("the invalid extension field should fail to deserialize");

        assert_eq!(error.to_string(), expected);
    }
}

#[test]
fn details_extensions_non_object_serialize() {
    const BAD_REQUEST: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Bad Request"),
        status: StatusCode::BAD_REQUEST,
    };

    for extensions in [json!(42), json!("invalid"), json!(["invalid"])] {
        let details = BAD_REQUEST.extensions(extensions);
        let error = serde_json::to_value(&details)
            .expect_err("the non-object extensions should fail to serialize");

        assert_eq!(
            error.to_string(),
            "problem extensions must serialize as an object",
            "the error should identify the unsupported extension shape"
        );
    }
}

#[test]
fn details_extensions_non_object_deserialize() {
    let body = json!({"type": "about:blank", "title": "Bad Request", "status": 400});
    let error = ProblemDetails::<'_, u32>::deserialize(body)
        .expect_err("the scalar extension type should fail to deserialize");

    assert_eq!(error.to_string(), "can only flatten structs and maps");
}
