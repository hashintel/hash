use alloc::format;
use core::fmt::{Display, Formatter};

use super::{Error, ErrorProperties, ErrorProperty, Id, Namespace, NAMESPACE};
use crate::{
    error::{macros::impl_error, Location, Schema},
    id,
};

#[derive(serde::Serialize)]
pub struct ExpectedType(Schema);

impl ExpectedType {
    #[must_use]
    pub const fn new(schema: Schema) -> Self {
        Self(schema)
    }

    pub(crate) const fn schema(&self) -> &Schema {
        &self.0
    }
}

impl ErrorProperty for ExpectedType {
    type Value<'a> = Option<&'a Self>;

    fn key() -> &'static str {
        "expected"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next()
    }
}

#[derive(serde::Serialize)]
pub struct ReceivedType(Schema);

impl ReceivedType {
    #[must_use]
    pub const fn new(schema: Schema) -> Self {
        Self(schema)
    }

    pub(crate) const fn schema(&self) -> &Schema {
        &self.0
    }
}

impl ErrorProperty for ReceivedType {
    type Value<'a> = Option<&'a Self>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next()
    }
}

#[derive(Debug)]
pub struct TypeError;

impl Error for TypeError {
    type Properties = (Location, ExpectedType, ReceivedType);

    const ID: Id = id!["type"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> core::fmt::Result {
        let (_, expected, received) = properties;

        let expected = expected
            .map(|expected| expected.schema().ty())
            .map(|ty| format!("expected value of type {ty}"));

        let received = received
            .map(|received| received.schema().ty())
            .map(|ty| format!("received value of unexpected type {ty}"));

        match (expected, received) {
            (Some(expected), Some(received)) => {
                fmt.write_fmt(format_args!("{expected}, but {received}"))
            }
            (Some(message), None) | (None, Some(message)) => fmt.write_str(&message),
            (None, None) => Display::fmt(self, fmt),
        }
    }
}

impl Display for TypeError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("received value of unexpected type")
    }
}

impl_error!(TypeError);

#[cfg(test)]
mod tests {
    use alloc::vec;

    use error_stack::Report;
    use serde_json::json;

    use super::*;
    use crate::test::{to_json, to_message};

    #[test]
    fn r#type() {
        // we simulate that the error is located here:
        // [{entry1: [_, {field2: _ <- here}]}]
        // we expected a u8 integer, but received a float

        let error = Report::new(TypeError)
            .attach(Location::Array(0))
            .attach(Location::Entry("entry1".into()))
            .attach(Location::Array(1))
            .attach(Location::Field("field2"))
            .attach(ExpectedType::new(
                Schema::new("integer")
                    .with("minimum", u8::MIN)
                    .with("maximum", u8::MAX),
            ))
            .attach(ReceivedType::new(Schema::new("string")));

        assert_eq!(
            to_json(&error),
            json!({
                "location": [
                    {"type": "array", "value": 0},
                    {"type": "entry", "value": "entry1"},
                    {"type": "array", "value": 1},
                    {"type": "field", "value": "field2"}
                ],
                "expected": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 255
                },
                "received": {
                    "type": "string"
                }
            })
        );
    }

    #[test]
    fn type_message() {
        assert_eq!(
            to_message(&Report::new(TypeError)),
            "received value of unexpected type"
        );

        assert_eq!(
            to_message(&Report::new(TypeError).attach(ReceivedType::new(Schema::new("string")))),
            r#"received value of unexpected type string"#
        );

        assert_eq!(
            to_message(&Report::new(TypeError).attach(ExpectedType::new(Schema::new("integer")))),
            r#"expected value of type integer"#
        );

        assert_eq!(
            to_message(
                &Report::new(TypeError)
                    .attach(ReceivedType::new(Schema::new("string")))
                    .attach(ExpectedType::new(Schema::new("integer")))
            ),
            "expected value of type integer, but received value of unexpected type string"
        );
    }
}
