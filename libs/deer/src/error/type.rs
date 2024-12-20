use alloc::format;
use core::{
    any::TypeId,
    fmt::{Display, Formatter},
};

use super::{ErrorProperties, ErrorProperty, Id, NAMESPACE, Namespace, Variant};
use crate::{error::Location, helpers::ExpectNone, id, schema::Document};

#[derive(serde::Serialize)]
pub struct ExpectedType(Document);

impl ExpectedType {
    #[must_use]
    pub const fn new(document: Document) -> Self {
        Self(document)
    }

    pub(crate) const fn document(&self) -> &Document {
        &self.0
    }
}

impl ErrorProperty for ExpectedType {
    type Value<'a> = Option<&'a Self>;

    fn key() -> &'static str {
        "expected"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        // TODO: once 0.2 drops with correct schemas remove this hack, this special cases
        //  `ExpectNone` and will effectively drop it from the chain.
        stack.find(|frame| frame.document().id != TypeId::of::<ExpectNone>())
    }
}

#[derive(serde::Serialize)]
pub struct ReceivedType(Document);

impl ReceivedType {
    #[must_use]
    pub const fn new(document: Document) -> Self {
        Self(document)
    }

    pub(crate) const fn document(&self) -> &Document {
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

impl Variant for TypeError {
    type Properties = (Location, ExpectedType, ReceivedType);

    const ID: Id = id!["type"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> core::fmt::Result {
        let (_, expected, received) = properties;

        let expected = expected
            .map(|expected| expected.document().schema().ty())
            .map(|ty| format!("expected value of type {ty}"));

        let received = received
            .map(|received| received.document().schema().ty())
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
    fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
        fmt.write_str("received value of unexpected type")
    }
}

#[cfg(test)]
mod tests {
    use error_stack::Report;
    use serde_json::json;

    use super::*;
    use crate::{
        Deserialize as _,
        error::Error,
        schema::{Reflection as _, visitor::StringSchema},
        test::{to_json, to_message},
    };

    #[test]
    fn r#type() {
        // we simulate that the error is located here:
        // [{entry1: [_, {field2: _ <- here}]}]
        // we expected a u8 integer, but received a float

        let error = Report::new(Error::new(TypeError))
            .attach(Location::Field("field2"))
            .attach(Location::Array(1))
            .attach(Location::Entry("entry1".into()))
            .attach(Location::Array(0))
            .attach(ExpectedType::new(u8::reflection()))
            .attach(ReceivedType::new(StringSchema::document()));

        assert_eq!(
            to_json::<TypeError>(&error),
            json!({
                "location": [
                    {"type": "array", "value": 0},
                    {"type": "entry", "value": "entry1"},
                    {"type": "array", "value": 1},
                    {"type": "field", "value": "field2"}
                ],
                "expected": {
                    "$ref": "#/$defs/0000-u8",
                    "$defs": {
                        "0000-u8": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 255,
                        }
                    },
                },
                "received": {
                    "$defs": {
                        "0000-deer::schema::visitor::StringSchema": {
                            "type": "string"
                        }
                    },
                    "$ref": "#/$defs/0000-deer::schema::visitor::StringSchema"
                }
            })
        );
    }

    #[test]
    fn type_message() {
        assert_eq!(
            to_message::<TypeError>(&Report::new(Error::new(TypeError))),
            "received value of unexpected type"
        );

        assert_eq!(
            to_message::<TypeError>(
                &Report::new(TypeError.into_error())
                    .attach(ReceivedType::new(StringSchema::document()))
            ),
            "received value of unexpected type string"
        );

        assert_eq!(
            to_message::<TypeError>(
                &Report::new(TypeError.into_error()).attach(ExpectedType::new(u8::reflection()))
            ),
            "expected value of type integer"
        );

        assert_eq!(
            to_message::<TypeError>(
                &Report::new(TypeError.into_error())
                    .attach(ReceivedType::new(StringSchema::document()))
                    .attach(ExpectedType::new(u8::reflection()))
            ),
            "expected value of type integer, but received value of unexpected type string"
        );
    }
}
