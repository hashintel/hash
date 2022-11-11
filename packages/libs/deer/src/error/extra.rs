use core::{
    fmt,
    fmt::{Display, Formatter},
};

use super::{
    fold_field, macros::impl_error, Error, ErrorProperties, ErrorProperty, Id, Location, Namespace,
    NAMESPACE,
};
use crate::id;

#[derive(serde::Serialize)]
pub struct ReceivedKey(String);

impl ErrorProperty for ReceivedKey {
    type Value<'a> = Vec<&'a Self>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        let mut stack: Vec<_> = stack.collect();
        stack.reverse();
        stack
    }
}

#[derive(Debug)]
pub struct ObjectItemsExtraError;

impl Error for ObjectItemsExtraError {
    type Properties = (Location, ReceivedKey);

    const ID: Id = id!["object", "items", "extra"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result {
        // received [n] unexpected keys ([received])
        let (_, received) = properties;

        if received.is_empty() {
            Display::fmt(self, fmt)
        } else {
            fmt.write_str("received ")?;

            match received.len() {
                1 => {
                    fmt.write_str("1 unexpected key")?;
                }
                n => {
                    Display::fmt(&n, fmt)?;
                    fmt.write_str(" unexpected keys")?;
                }
            };

            let received = fold_field(received.iter().map(|ReceivedKey(key)| key.as_str()));
            fmt.write_str(" (")?;
            fmt.write_str(&received)?;
            fmt.write_str(")")
        }
    }
}

impl Display for ObjectItemsExtraError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("received unexpected keys")
    }
}

impl_error!(ObjectItemsExtraError);

#[derive(serde::Serialize)]
pub struct ExpectedLength(usize);

impl ErrorProperty for ExpectedLength {
    type Value<'a> = Option<&'a Self>;

    fn key() -> &'static str {
        "expected"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next()
    }
}

#[derive(serde::Serialize)]
pub struct ReceivedLength(usize);

impl ErrorProperty for ReceivedLength {
    type Value<'a> = Option<&'a Self>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack.next()
    }
}

#[derive(Debug)]
pub struct ArrayLengthError;

impl Error for ArrayLengthError {
    type Properties = (Location, ExpectedLength, ReceivedLength);

    const ID: Id = id!["array", "length"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result {
        // expected array of length {expected}, but received array of length {received}
        let (_, expected, received) = properties;

        let has_expected = expected.is_some();
        let has_received = received.is_some();

        if let Some(ExpectedLength(length)) = expected {
            fmt.write_fmt(format_args!("expected array of length {length}"))?;
        }

        if has_expected && has_received {
            fmt.write_str(", but ")?;
        }

        if let Some(ReceivedLength(length)) = received {
            fmt.write_fmt(format_args!("received array of length {length}"))?;
        }

        if !has_expected && !has_received {
            Display::fmt(self, fmt)?;
        }

        Ok(())
    }
}

impl Display for ArrayLengthError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("received more items than expected")
    }
}

impl_error!(ArrayLengthError);

#[cfg(test)]
mod tests {
    use error_stack::Report;
    use serde_json::json;

    use super::*;
    use crate::test::{to_json, to_message};

    #[test]
    fn array() {
        // we simulate that the error happens in:
        // [..., {field1: [_, _, _] <- here}]
        let error = Report::new(ArrayLengthError)
            .attach(Location::Array(1))
            .attach(Location::Field("field1"))
            .attach(ExpectedLength(2))
            .attach(ReceivedLength(3));

        let value = to_json(&error);

        assert_eq!(
            value,
            json!({
                "location": [
                    {"type": "array", "value": 1},
                    {"type": "field", "value": "field1"}
                ],
                "expected": 2,
                "received": 3
            })
        );
    }

    #[test]
    fn array_message() {
        assert_eq!(
            to_message(&Report::new(ArrayLengthError)),
            "received more items than expected"
        );

        assert_eq!(
            to_message(
                &Report::new(ArrayLengthError) //
                    .attach(ReceivedLength(3))
            ),
            "received array of length 3"
        );

        assert_eq!(
            to_message(
                &Report::new(ArrayLengthError) //
                    .attach(ExpectedLength(2))
            ),
            "expected array of length 2"
        );

        assert_eq!(
            to_message(
                &Report::new(ArrayLengthError)
                    .attach(ExpectedLength(2))
                    .attach(ReceivedLength(3))
            ),
            "expected array of length 2, but received array of length 3"
        );
    }

    #[test]
    fn object() {
        // we simulate that the error happens in:
        // [..., {field1: [...], field2: [...]} <- here]
        let error = Report::new(ObjectItemsExtraError)
            .attach(Location::Array(1))
            .attach(ReceivedKey("field2".to_owned()));

        let value = to_json(&error);

        assert_eq!(
            value,
            json!({
                "location": [
                    {"type": "array", "value": 1}
                ],
                "received": ["field2"]
            })
        );
    }

    #[test]
    fn object_message() {
        assert_eq!(
            to_message(&Report::new(ObjectItemsExtraError)),
            "received unexpected keys"
        );

        assert_eq!(
            to_message(
                &Report::new(ObjectItemsExtraError) //
                    .attach(ReceivedKey("field1".to_owned())),
            ),
            r#"received 1 unexpected key ("field1")"#
        );

        assert_eq!(
            to_message(
                &Report::new(ObjectItemsExtraError) //
                    .attach(ReceivedKey("field1".to_owned()))
                    .attach(ReceivedKey("field2".to_owned())),
            ),
            r#"received 2 unexpected keys ("field1", "field2")"#
        );
    }
}
