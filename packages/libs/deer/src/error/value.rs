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

        let expected = expected.map(|ExpectedType(inner)| inner.ty()).map(|ty| {
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
        // [{field1: 256 <- here}, _, _]
        // The value should be an i8, so between 0 and 255

        let error = Report::new(ValueError)
            .attach(Location::Array(0))
            .attach(Location::Field("field1"))
            .attach(ExpectedType(
                Schema::new("integer")
                    .with("minimum", 0)
                    .with("maximum", 255),
            ))
            .attach(ReceivedValue(Box::new(256u16)));

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
                &Report::new(ValueError).attach(ExpectedType(
                    Schema::new("integer")
                        .with("minimum", 0)
                        .with("maximum", 255)
                ))
            ),
            "received value is of correct type (integer), but does not fit constraints"
        );
    }
}
