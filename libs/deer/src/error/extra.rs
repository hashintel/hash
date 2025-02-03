#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::{string::String, vec::Vec};
use core::{
    fmt,
    fmt::{Display, Formatter},
};

use error_stack::Report;

use super::{
    ErrorProperties, ErrorProperty, Id, Location, NAMESPACE, Namespace, Variant, fmt_fold_fields,
};
use crate::{ArrayAccess, ObjectAccess, error::Error, id};

#[derive(serde::Serialize)]
pub struct ReceivedKey(String);

impl ReceivedKey {
    #[must_use]
    pub fn new(key: impl Into<String>) -> Self {
        Self(key.into())
    }
}

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

impl Variant for ObjectItemsExtraError {
    type Properties = (Location, ReceivedKey);

    const ID: Id = id!["object", "items", "extra"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
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
            }

            fmt.write_str(" (")?;
            fmt_fold_fields(fmt, received.iter().map(|ReceivedKey(key)| key.as_str()))?;
            fmt.write_str(")")
        }
    }
}

impl Display for ObjectItemsExtraError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("received unexpected keys")
    }
}

#[derive(Debug)]
pub struct ObjectLengthError;

impl ObjectLengthError {
    #[expect(clippy::new_ret_no_self)] // Reason: `Variant` are special
    pub fn new<'de, A: ObjectAccess<'de>>(access: &A, expected: usize) -> Report<Error> {
        let mut error = Report::new(Self.into_error()).attach(ExpectedLength::new(expected));

        if let Some(length) = access.size_hint() {
            error = error.attach(ReceivedLength::new(length));
        }

        error
    }
}

impl Variant for ObjectLengthError {
    type Properties = (Location, ExpectedLength, ReceivedLength);

    const ID: Id = id!["object", "length"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> fmt::Result {
        // expected object of length {expected}, but received object of length {received}
        let (_, expected, received) = properties;

        let has_expected = expected.is_some();
        let has_received = received.is_some();

        if let Some(ExpectedLength(length)) = expected {
            fmt.write_fmt(format_args!("expected object of length {length}"))?;
        }

        if has_expected && has_received {
            fmt.write_str(", but ")?;
        }

        if let Some(ReceivedLength(length)) = received {
            fmt.write_fmt(format_args!("received object of length {length}"))?;
        }

        if !has_expected && !has_received {
            Display::fmt(self, fmt)?;
        }

        Ok(())
    }
}

impl Display for ObjectLengthError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("received more items than expected")
    }
}

#[derive(serde::Serialize)]
pub struct ExpectedLength(usize);

impl ExpectedLength {
    #[must_use]
    pub const fn new(length: usize) -> Self {
        Self(length)
    }
}

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

impl ReceivedLength {
    #[must_use]
    pub const fn new(length: usize) -> Self {
        Self(length)
    }
}

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

impl ArrayLengthError {
    #[expect(clippy::new_ret_no_self)] // Reason: `Variant` are special
    pub fn new<'de, A: ArrayAccess<'de>>(access: &A, expected: usize) -> Report<Error> {
        let mut error = Report::new(Self.into_error()).attach(ExpectedLength::new(expected));

        if let Some(length) = access.size_hint() {
            error = error.attach(ReceivedLength::new(length));
        }

        error
    }
}

impl Variant for ArrayLengthError {
    type Properties = (Location, ExpectedLength, ReceivedLength);

    const ID: Id = id!["array", "length"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'_>,
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
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("received more items than expected")
    }
}

#[cfg(test)]
mod tests {
    #[cfg_attr(feature = "std", allow(unused_imports))]
    use alloc::{borrow::ToOwned as _, vec};

    use serde_json::json;

    use super::*;
    use crate::test::{to_json, to_message};

    #[test]
    fn array() {
        // we simulate that the error happens in:
        // [..., {field1: [_, _, _] <- here}]
        let error = Report::new(Error::new(ArrayLengthError))
            .attach(Location::Field("field1"))
            .attach(Location::Array(1))
            .attach(ExpectedLength::new(2))
            .attach(ReceivedLength::new(3));

        let value = to_json::<ArrayLengthError>(&error);

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
            to_message::<ArrayLengthError>(&Report::new(ArrayLengthError.into_error())),
            "received more items than expected"
        );

        assert_eq!(
            to_message::<ArrayLengthError>(
                &Report::new(ArrayLengthError.into_error()) //
                    .attach(ReceivedLength::new(3))
            ),
            "received array of length 3"
        );

        assert_eq!(
            to_message::<ArrayLengthError>(
                &Report::new(ArrayLengthError.into_error()) //
                    .attach(ExpectedLength::new(2))
            ),
            "expected array of length 2"
        );

        assert_eq!(
            to_message::<ArrayLengthError>(
                &Report::new(ArrayLengthError.into_error())
                    .attach(ExpectedLength::new(2))
                    .attach(ReceivedLength::new(3))
            ),
            "expected array of length 2, but received array of length 3"
        );
    }

    #[test]
    fn object_length() {
        // we simulate that the error happens in:
        // [..., {field1: {_: _, _: _, _: _} <- here}]
        let error = Report::new(Error::new(ObjectLengthError))
            .attach(Location::Field("field1"))
            .attach(Location::Array(1))
            .attach(ExpectedLength::new(2))
            .attach(ReceivedLength::new(3));

        let value = to_json::<ObjectLengthError>(&error);

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
    fn object_length_message() {
        assert_eq!(
            to_message::<ObjectLengthError>(&Report::new(ObjectLengthError.into_error())),
            "received more items than expected"
        );

        assert_eq!(
            to_message::<ObjectLengthError>(
                &Report::new(ObjectLengthError.into_error()) //
                    .attach(ReceivedLength::new(3))
            ),
            "received object of length 3"
        );

        assert_eq!(
            to_message::<ObjectLengthError>(
                &Report::new(ObjectLengthError.into_error()) //
                    .attach(ExpectedLength::new(2))
            ),
            "expected object of length 2"
        );

        assert_eq!(
            to_message::<ObjectLengthError>(
                &Report::new(ObjectLengthError.into_error())
                    .attach(ExpectedLength::new(2))
                    .attach(ReceivedLength::new(3))
            ),
            "expected object of length 2, but received object of length 3"
        );
    }

    #[test]
    fn object_extra() {
        // we simulate that the error happens in:
        // [..., {field1: [...], field2: [...]} <- here]
        let error = Report::new(ObjectItemsExtraError.into_error())
            .attach(Location::Array(1))
            .attach(ReceivedKey::new("field2"));

        let value = to_json::<ObjectItemsExtraError>(&error);

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
    fn object_extra_message() {
        assert_eq!(
            to_message::<ObjectItemsExtraError>(&Report::new(ObjectItemsExtraError.into_error())),
            "received unexpected keys"
        );

        assert_eq!(
            to_message::<ObjectItemsExtraError>(
                &Report::new(ObjectItemsExtraError.into_error()) //
                    .attach(ReceivedKey("field1".to_owned())),
            ),
            r#"received 1 unexpected key ("field1")"#
        );

        assert_eq!(
            to_message::<ObjectItemsExtraError>(
                &Report::new(ObjectItemsExtraError.into_error()) //
                    .attach(ReceivedKey("field1".to_owned()))
                    .attach(ReceivedKey("field2".to_owned())),
            ),
            r#"received 2 unexpected keys ("field1", "field2")"#
        );
    }
}
