extern crate alloc;

use alloc::{borrow::Cow, format};
use core::{cell::Cell, fmt};

use problematic::ProblemDetails;
use serde::{
    Serialize, Serializer,
    ser::{Error as _, SerializeMap as _},
};
use serde_json::{Value, json};

const fn details<E>(extensions: E) -> ProblemDetails<'static, 'static, E> {
    ProblemDetails {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Bad Request"),
        status: 400,
        detail: None,
        instance: None,
        extensions,
    }
}

fn assert_serialization_error<E: Serialize>(extensions: E, expected: &str) {
    let details = details(extensions);
    let string_error = serde_json::to_string(&details)
        .expect_err("the invalid extensions should fail to serialize to a string");
    let value_error = serde_json::to_value(&details)
        .expect_err("the invalid extensions should fail to serialize to a value");
    assert_eq!(
        string_error.to_string(),
        expected,
        "the string error should explain the failure"
    );
    assert_eq!(
        value_error.to_string(),
        expected,
        "the value error should explain the failure"
    );
}

fn assert_serialization<E: Serialize>(extensions: E, expected: &Value) {
    let details = details(extensions);
    let encoded =
        serde_json::to_string(&details).expect("the extensions should serialize to a string");
    assert_eq!(
        serde_json::from_str::<Value>(&encoded).expect("the document should be valid JSON"),
        *expected,
        "the string should contain the expected problem document"
    );
    assert_eq!(
        serde_json::to_value(&details).expect("the extensions should serialize to a value"),
        *expected,
        "the value should contain the expected problem document"
    );
}

/// All standard names are reserved, including occurrence fields absent from the document.
#[test]
fn extensions_reserved_map_members() {
    for name in ["type", "title", "status", "detail", "instance"] {
        assert_serialization_error(
            json!({name: "invalid"}),
            &format!("problem extension `{name}` conflicts with a standard member"),
        );
    }
}

/// Validation uses emitted names, while skipped fields do not contribute members.
#[test]
fn extensions_reserved_struct_members() {
    #[derive(Serialize)]
    struct Extensions {
        #[serde(rename = "status", skip_serializing_if = "Option::is_none")]
        code: Option<u16>,
    }

    assert_serialization_error(
        Extensions { code: Some(499) },
        "problem extension `status` conflicts with a standard member",
    );
    assert_serialization(
        Extensions { code: None },
        &json!({"type": "about:blank", "title": "Bad Request", "status": 400}),
    );
}

/// Only top-level names are reserved; nested objects retain their own member names.
#[test]
fn extensions_nested_members() {
    assert_serialization(
        json!({"context": {"type": "context", "title": "Context", "status": 1, "detail": "nested", "instance": "nested"}}),
        &json!({"type": "about:blank", "title": "Bad Request", "status": 400,
            "context": {"type": "context", "title": "Context", "status": 1, "detail": "nested", "instance": "nested"}}),
    );
}

/// Wrapping an extension preserves both valid object contents and validation failures.
#[test]
fn extensions_wrapped_objects() {
    #[derive(Serialize)]
    struct Wrapped<T>(T);

    assert_serialization(
        Some(Wrapped(json!({"parameter": "limit"}))),
        &json!({"type": "about:blank", "title": "Bad Request", "status": 400, "parameter": "limit"}),
    );
    assert_serialization_error(
        Wrapped(json!({"title": "invalid"})),
        "problem extension `title` conflicts with a standard member",
    );
    assert_serialization_error(
        Wrapped(42),
        "problem extensions must serialize as an object",
    );
}

/// Nulls, scalars, and sequences fail consistently across the JSON serializers.
#[test]
fn extensions_non_objects() {
    for value in [
        json!(null),
        json!(true),
        json!(42),
        json!(1.5),
        json!("invalid"),
        json!([]),
    ] {
        assert_serialization_error(value, "problem extensions must serialize as an object");
    }
    assert_serialization_error((), "problem extensions must serialize as an object");
    assert_serialization_error((1, 2), "problem extensions must serialize as an object");
}

/// Externally tagged variants contribute a single member named after the serialized variant.
#[test]
fn extensions_enum_members() {
    #[derive(Serialize)]
    enum Extensions {
        #[serde(rename = "context")]
        Context {
            status: u16,
        },
        #[serde(rename = "type")]
        Newtype(u16),
        #[serde(rename = "detail")]
        Tuple(u16, u16),
        #[serde(rename = "instance")]
        Struct {
            value: u16,
        },
        Unit,
    }

    assert_serialization(
        Extensions::Context { status: 42 },
        &json!({"type": "about:blank", "title": "Bad Request", "status": 400, "context": {"status": 42}}),
    );
    for (extensions, name) in [
        (Extensions::Newtype(1), "type"),
        (Extensions::Tuple(1, 2), "detail"),
        (Extensions::Struct { value: 1 }, "instance"),
    ] {
        assert_serialization_error(
            extensions,
            &format!("problem extension `{name}` conflicts with a standard member"),
        );
    }
    assert_serialization_error(
        Extensions::Unit,
        "problem extensions must serialize as an object",
    );
}

struct Entry<K> {
    key: K,
    split: bool,
}

impl<K: Serialize> Serialize for Entry<K> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(1))?;
        if self.split {
            map.serialize_key(&self.key)?;
            map.serialize_value(&42)?;
        } else {
            map.serialize_entry(&self.key, &42)?;
        }
        map.end()
    }
}

struct FormattedKey<'a>(&'a str);

impl Serialize for FormattedKey<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self.0)
    }
}

/// Both map APIs check names produced through strings, newtypes, enum keys, and formatting.
#[test]
fn extensions_map_key_representations() {
    #[derive(Serialize)]
    struct WrappedKey(&'static str);

    #[derive(Serialize)]
    enum Key {
        #[serde(rename = "status")]
        Status,
    }

    for split in [false, true] {
        let expected = "problem extension `status` conflicts with a standard member";
        assert_serialization_error(
            Entry {
                key: "status",
                split,
            },
            expected,
        );
        assert_serialization_error(
            Entry {
                key: WrappedKey("status"),
                split,
            },
            expected,
        );
        assert_serialization_error(
            Entry {
                key: Key::Status,
                split,
            },
            expected,
        );
        assert_serialization_error(
            Entry {
                key: FormattedKey("status"),
                split,
            },
            expected,
        );
        assert_serialization(
            Entry {
                key: FormattedKey("parameter"),
                split,
            },
            &json!({"type": "about:blank", "title": "Bad Request", "status": 400, "parameter": 42}),
        );
    }
}

struct CountedKey<'a>(&'a Cell<usize>);

impl Serialize for CountedKey<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let previous = self.0.replace(self.0.get() + 1);
        serializer.serialize_str(if previous == 0 { "parameter" } else { "status" })
    }
}

/// A stateful key is validated during its only serialization, so its emitted name cannot change.
#[test]
fn extensions_map_key_once() {
    for split in [false, true] {
        let calls = Cell::new(0);
        let details = details(Entry {
            key: CountedKey(&calls),
            split,
        });
        let encoded = serde_json::to_string(&details).expect("the key should serialize once");
        assert_eq!(calls.get(), 1, "the key should serialize exactly once");
        assert_eq!(
            serde_json::from_str::<Value>(&encoded).expect("the document should be valid JSON")
                ["parameter"],
            42,
            "the emitted key should match the validated key"
        );
        calls.set(0);
        let value = serde_json::to_value(&details).expect("the key should serialize once");
        assert_eq!(calls.get(), 1, "the key should serialize exactly once");
        assert_eq!(
            value["parameter"], 42,
            "the emitted key should match the validated key"
        );
    }
}

struct BrokenExtensions;

impl Serialize for BrokenExtensions {
    fn serialize<S: Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
        Err(S::Error::custom("extension serialization failed"))
    }
}

/// Extension and nested value errors retain the underlying serializer's diagnostic.
#[test]
fn extensions_serializer_failures() {
    #[derive(Serialize)]
    struct Nested {
        context: BrokenExtensions,
    }

    assert_serialization_error(BrokenExtensions, "extension serialization failed");
    assert_serialization_error(
        Nested {
            context: BrokenExtensions,
        },
        "extension serialization failed",
    );
}

struct BrokenFormat;

impl fmt::Display for BrokenFormat {
    fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result {
        Err(fmt::Error)
    }
}

impl Serialize for BrokenFormat {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

/// A formatting failure in a map key propagates as a Serde error.
#[test]
fn extensions_key_format_failure() {
    assert_serialization_error(
        Entry {
            key: BrokenFormat,
            split: false,
        },
        &fmt::Error.to_string(),
    );
}
