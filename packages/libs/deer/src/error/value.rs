use alloc::{boxed::Box, format};
use core::{
    fmt,
    fmt::{Display, Formatter},
};

use super::{
    macros::impl_error, r#type::ExpectedType, Error, ErrorProperties, ErrorProperty, Id, Location,
    Namespace, NAMESPACE,
};
use crate::id;

#[derive(serde::Serialize)]
pub struct ReceivedValue(Box<dyn erased_serde::Serialize + Send + Sync>);

impl ReceivedValue {
    #[must_use]
    pub fn new(value: impl erased_serde::Serialize + Send + Sync + 'static) -> Self {
        Self(Box::new(value))
    }
}

impl ErrorProperty for ReceivedValue {
    type Value<'a> = Option<&'a Self>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next()
    }
}

#[derive(Debug)]
pub struct ValueError;

impl Error for ValueError {
    type Properties = (Location, ExpectedType, ReceivedValue);

    const ID: Id = id!["value"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result {
        let (_, expected, _) = properties;

        let expected = expected.map(|expected| expected.schema().ty()).map(|ty| {
            format!("received value is of correct type ({ty}), but does not fit constraints")
        });

        match expected {
            Some(expected) => fmt.write_str(&expected),
            None => Display::fmt(self, fmt),
        }
    }
}

impl Display for ValueError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("received value is of correct type, but does not fit constraints")
    }
}

impl_error!(ValueError);

#[derive(Debug)]
pub struct MissingError;

impl Error for MissingError {
    type Properties = (Location, ExpectedType);

    const ID: Id = id!["value", "missing"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result {
        let (_, expected) = properties;

        match expected {
            Some(expected) => {
                let ty = expected.schema().ty();

                fmt.write_fmt(format_args!(
                    "received no value, but expected value of type {ty}"
                ))
            }
            None => Display::fmt(self, fmt),
        }
    }
}

impl Display for MissingError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("unexpected missing value")
    }
}

impl_error!(MissingError);

#[cfg(test)]
mod tests {
    use alloc::vec;

    use error_stack::Report;
    use serde_json::json;

    use super::*;
    use crate::{
        error::Schema,
        test::{to_json, to_message},
    };

    #[test]
    fn value() {
        // we simulate that the error is in:
        // [{field1: _, here ->}, _, _]
        // We expect a value at field2, but that field does not exist

        let error = Report::new(ValueError)
            .attach(Location::Field("field1"))
            .attach(Location::Array(0))
            .attach(ExpectedType::new(
                Schema::new("integer")
                    .with("minimum", u8::MIN)
                    .with("maximum", u8::MAX),
            ))
            .attach(ReceivedValue::new(u16::from(u8::MAX) + 1));

        assert_eq!(
            to_json(&error),
            json!({
                "location": [
                    {"type": "array", "value": 0},
                    {"type": "field", "value": "field1"}
                ],
                "expected": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 255,
                },
                "received": 256
            })
        );
    }

    #[test]
    fn value_message() {
        assert_eq!(
            to_message(&Report::new(ValueError)),
            "received value is of correct type, but does not fit constraints"
        );

        assert_eq!(
            to_message(
                &Report::new(ValueError).attach(ExpectedType::new(
                    Schema::new("integer")
                        .with("minimum", u8::MIN)
                        .with("maximum", u8::MAX),
                ))
            ),
            "received value is of correct type (integer), but does not fit constraints"
        );
    }

    #[test]
    fn missing() {
        // we simulate that the error is in:
        // [{field1: _, here ->}, _, _]
        // We expect a value of type u8 at field2, but that field does not exist

        let error = Report::new(MissingError)
            .attach(Location::Field("field2"))
            .attach(Location::Array(0))
            .attach(ExpectedType::new(
                Schema::new("integer")
                    .with("minimum", u8::MIN)
                    .with("maximum", u8::MAX),
            ));

        assert_eq!(
            to_json(&error),
            json!({
                "location": [
                    {"type": "array", "value": 0},
                    {"type": "field", "value": "field2"}
                ],
                "expected": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 255,
                }
            })
        );
    }

    #[test]
    fn missing_message() {
        assert_eq!(
            to_message(&Report::new(MissingError)),
            "unexpected missing value"
        );

        assert_eq!(
            to_message(
                &Report::new(MissingError).attach(ExpectedType::new(
                    Schema::new("integer")
                        .with("minimum", u8::MIN)
                        .with("maximum", u8::MAX),
                ))
            ),
            "received no value, but expected value of type integer"
        );
    }
}
