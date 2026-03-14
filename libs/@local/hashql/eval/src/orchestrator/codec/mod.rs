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
