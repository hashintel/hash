pub(crate) mod decode;
pub(crate) mod encode;

#[derive(Debug)]
pub(crate) struct Postgres<T>(pub T);

#[derive(Debug)]
pub(crate) struct Serde<T>(pub T);

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum JsonValueRef<'value> {
    Null,
    Bool(bool),
    Number(&'value serde_json::Number),
    String(&'value str),
    Array(&'value [serde_json::Value]),
    Object(&'value serde_json::Map<String, serde_json::Value>),
}

/// The kind of a JSON value, without carrying the actual data.
///
/// Used in error reporting to describe what was received when a decode fails.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum JsonValueKind {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object,
}

impl JsonValueKind {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Bool => "boolean",
            Self::Number => "number",
            Self::String => "string",
            Self::Array => "array",
            Self::Object => "object",
        }
    }
}

impl From<JsonValueRef<'_>> for JsonValueKind {
    fn from(value: JsonValueRef<'_>) -> Self {
        match value {
            JsonValueRef::Null => Self::Null,
            JsonValueRef::Bool(_) => Self::Bool,
            JsonValueRef::Number(_) => Self::Number,
            JsonValueRef::String(_) => Self::String,
            JsonValueRef::Array(_) => Self::Array,
            JsonValueRef::Object(_) => Self::Object,
        }
    }
}

impl<'value> From<&'value serde_json::Value> for JsonValueRef<'value> {
    fn from(value: &'value serde_json::Value) -> Self {
        match value {
            serde_json::Value::Null => JsonValueRef::Null,
            &serde_json::Value::Bool(value) => JsonValueRef::Bool(value),
            serde_json::Value::Number(number) => JsonValueRef::Number(number),
            serde_json::Value::String(string) => JsonValueRef::String(string.as_str()),
            serde_json::Value::Array(array) => JsonValueRef::Array(array),
            serde_json::Value::Object(object) => JsonValueRef::Object(object),
        }
    }
}
