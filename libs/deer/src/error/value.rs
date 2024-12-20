#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::{boxed::Box, format};
use core::{
    fmt,
    fmt::{Display, Formatter},
};

use super::{
    ErrorProperties, ErrorProperty, Id, Location, NAMESPACE, Namespace, Variant,
    r#type::ExpectedType,
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

impl Variant for ValueError {
    type Properties = (Location, ExpectedType, ReceivedValue);

    const ID: Id = id!["value"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> fmt::Result {
        let (_, expected, _) = properties;

        let expected = expected
            .map(|expected| expected.document().schema().ty())
            .map(|ty| {
                format!("received value is of correct type ({ty}), but does not fit constraints")
            });

        match expected {
            Some(expected) => fmt.write_str(&expected),
            None => Display::fmt(self, fmt),
        }
    }
}

impl Display for ValueError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("received value is of correct type, but does not fit constraints")
    }
}

#[derive(Debug)]
pub struct MissingError;

impl Variant for MissingError {
    type Properties = (Location, ExpectedType);

    const ID: Id = id!["value", "missing"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> fmt::Result {
        let (_, expected) = properties;

        match expected {
            Some(expected) => {
                let ty = expected.document().schema().ty();

                fmt.write_fmt(format_args!(
                    "received no value, but expected value of type {ty}"
                ))
            }
            None => Display::fmt(self, fmt),
        }
    }
}

impl Display for MissingError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("unexpected missing value")
    }
}

#[cfg(test)]
mod tests {
    use error_stack::Report;
    use serde_json::json;

    use super::*;
    use crate::{
        Deserialize as _,
        test::{to_json, to_message},
    };

    #[test]
    fn value() {
        // we simulate that the error is in:
        // [{field1: _, here ->}, _, _]
        // We expect a value at field2, but that field does not exist

        let error = Report::new(ValueError.into_error())
            .attach(Location::Field("field1"))
            .attach(Location::Array(0))
            .attach(ExpectedType::new(u8::reflection()))
            .attach(ReceivedValue::new(u16::from(u8::MAX) + 1));

        assert_eq!(
            to_json::<ValueError>(&error),
            json!({
                "location": [
                    {"type": "array", "value": 0},
                    {"type": "field", "value": "field1"}
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
                "received": 256
            })
        );
    }

    #[test]
    fn value_message() {
        assert_eq!(
            to_message::<ValueError>(&Report::new(ValueError.into_error())),
            "received value is of correct type, but does not fit constraints"
        );

        assert_eq!(
            to_message::<ValueError>(
                &Report::new(ValueError.into_error()).attach(ExpectedType::new(u8::reflection()))
            ),
            "received value is of correct type (integer), but does not fit constraints"
        );
    }

    #[test]
    fn missing() {
        // we simulate that the error is in:
        // [{field1: _, here ->}, _, _]
        // We expect a value of type u8 at field2, but that field does not exist

        let error = Report::new(MissingError.into_error())
            .attach(Location::Field("field2"))
            .attach(Location::Array(0))
            .attach(ExpectedType::new(u8::reflection()));

        assert_eq!(
            to_json::<MissingError>(&error),
            json!({
                "location": [
                    {"type": "array", "value": 0},
                    {"type": "field", "value": "field2"}
                ],
                "expected":  {
                    "$ref": "#/$defs/0000-u8",
                    "$defs": {
                        "0000-u8": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 255,
                        }
                    },
                }
            })
        );
    }

    #[test]
    fn missing_message() {
        assert_eq!(
            to_message::<MissingError>(&Report::new(MissingError.into_error())),
            "unexpected missing value"
        );

        assert_eq!(
            to_message::<MissingError>(
                &Report::new(MissingError.into_error()).attach(ExpectedType::new(u8::reflection()))
            ),
            "received no value, but expected value of type integer"
        );
    }
}
