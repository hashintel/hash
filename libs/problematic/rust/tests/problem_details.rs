extern crate alloc;

use alloc::{borrow::Cow, string::String, vec::Vec};
use core::assert_matches;

use problematic::{ProblemDetails, ProblemType, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Serialize, Deserialize)]
struct InvalidParameters {
    parameters: Vec<String>,
}

const BAD_REQUEST: ProblemType = ProblemType {
    type_uri: Cow::Borrowed("about:blank"),
    title: Cow::Borrowed("Bad Request"),
    status: StatusCode::BAD_REQUEST,
};

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
    let details: ProblemDetails<'_> =
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
    let details: ProblemDetails<'_> =
        serde_json::from_str(encoded).expect("the response should deserialize without a type");

    assert_matches!(details.type_uri, Cow::Borrowed("about:blank"));
    assert_eq!(
        serde_json::to_value(details).expect("the details should serialize"),
        json!({"type": "about:blank", "title": "Internal Server Error", "status": 500})
    );
}

#[test]
fn details_status_boundaries() {
    for status in [100, 599] {
        let body = json!({"type": "about:blank", "title": "Bad Request", "status": status});
        let details = ProblemDetails::<'_, ()>::deserialize(&body)
            .expect("the boundary status should deserialize");

        assert_eq!(
            serde_json::to_value(&details).expect("the boundary status should serialize"),
            body,
            "the boundary status should be preserved"
        );
    }
}

#[test]
fn details_status_out_of_range() {
    let mut details = ProblemDetails::from(&BAD_REQUEST);
    for status in [600, 999] {
        details.status = StatusCode::from_u16(status).expect("the status should be representable");
        let error = serde_json::to_value(&details)
            .expect_err("the out-of-range status should fail to serialize");

        assert_eq!(
            error.to_string(),
            format!("problem status code {status} is outside 100..=599"),
            "the serialization error should identify the invalid status and allowed range"
        );
    }

    for status in [99, 600, 1000] {
        let error = ProblemDetails::<'_, ()>::deserialize(
            json!({"title": "Bad Request", "status": status}),
        )
        .expect_err("the out-of-range status should fail to deserialize");

        assert_eq!(
            error.to_string(),
            format!("problem status code {status} is outside 100..=599"),
            "the deserialization error should identify the invalid status and allowed range"
        );
    }
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
    let details: ProblemDetails<'_> =
        serde_json::from_str(&encoded).expect("the response should deserialize from a string");

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

#[test]
fn details_escaped_deserialize() {
    let encoded = r#"{
        "type": "https:\/\/example.com/problems/invalid-parameters",
        "title": "Invalid parameters",
        "status": 400,
        "detail": "The limit must be a positive integer.",
        "instance": "https:\/\/example.com/problem-occurrences/42"
    }"#;
    let body = json!({
        "type": "https://example.com/problems/invalid-parameters",
        "title": "Invalid parameters",
        "status": 400,
        "detail": "The limit must be a positive integer.",
        "instance": "https://example.com/problem-occurrences/42"
    });
    let details: ProblemDetails<'_> =
        serde_json::from_str(encoded).expect("the escaped response should deserialize");

    // `type` is a `Cow` field and `instance` an optional one, and both carry an escape.
    assert_matches!(
        details,
        ProblemDetails {
            type_uri: Cow::Owned(_),
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
fn details_null_occurrence_fields() {
    let details = ProblemDetails::<'_, ()>::deserialize(json!({
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
