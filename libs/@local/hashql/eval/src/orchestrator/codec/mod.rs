//! JSON codec for converting between interpreter [`Value`]s and the PostgreSQL
//! wire format.
//!
//! - [`decode`]: deserializes JSON column values (from `tokio_postgres` rows) into typed
//!   [`Value`]s, guided by the HashQL type system.
//! - [`encode`]: serializes runtime [`Value`]s and query parameters into forms that
//!   `tokio_postgres` can send to the database (via [`ToSql`]).
//!
//! The [`JsonValueRef`] type provides a borrowed view over `serde_json::Value`
//! that avoids cloning during decode, while [`JsonValueKind`] is a data-free
//! tag used in error reporting.
//!
//! [`Value`]: hashql_mir::interpret::value::Value
//! [`ToSql`]: postgres_types::ToSql

pub(crate) mod decode;
pub(crate) mod encode;

pub use self::decode::Decoder;
pub use crate::orchestrator::error::DecodeError;

/// Newtype wrapper that provides [`ToSql`](postgres_types::ToSql)
/// implementations for types that need custom PostgreSQL wire encoding.
#[derive(Debug)]
pub(crate) struct Postgres<T>(pub T);

/// Newtype wrapper that provides [`Serialize`](serde::Serialize)
/// implementations for types that need custom JSON serialization.
///
/// Wrap a `&Value` in `Serde` to serialize it to JSON using the interpreter's
/// value representation rules: booleans serialize as JSON booleans (not
/// integers), opaques unwrap to their inner value, structs serialize as
/// objects with field names as keys.
#[derive(Debug)]
pub struct Serde<T>(pub T);

/// Borrowed view over a JSON value, avoiding clones during decode.
///
/// Mirrors the variants of [`serde_json::Value`] but holds references
/// instead of owned data. Constructed from `&serde_json::Value` via the
/// [`From`] impl, or directly for single-typed columns (e.g.
/// `JsonValueRef::String(&str)` for a `TEXT` column).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum JsonValueRef<'value> {
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
