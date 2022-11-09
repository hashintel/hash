use core::{
    fmt,
    fmt::{Display, Formatter},
};

use super::{
    macros::impl_error, Error, ErrorProperties, ErrorProperty, Id, Location, Namespace, NAMESPACE,
};
use crate::id;

#[derive(serde::Serialize)]
pub struct ReceivedKeysValue<'a> {
    keys: Vec<&'a str>,
}

pub struct ReceivedKeys(String);

impl ErrorProperty for ReceivedKeys {
    type Value<'a> = ReceivedKeysValue<'a>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        ReceivedKeysValue {
            keys: stack.map(|Self(inner)| inner.as_str()).collect(),
        }
    }
}

#[derive(Debug)]
pub struct ObjectItemsExtraError;

impl Error for ObjectItemsExtraError {
    type Properties = (Location, ReceivedKeys);

    const ID: Id = id!("object", "items", "extra");
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result {
        // received extra keys ({received,})
        let (_, received) = properties;

        if received.keys.is_empty() {
            Display::fmt(self, fmt)
        } else {
            let received = fold_field(received.keys.iter().copied());

            fmt.write_fmt(format_args!("received extra keys ({received})"))
        }
    }
}

impl Display for ObjectItemsExtraError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("received extra keys, which are invalid")
    }
}

impl_error!(ObjectItemsExtraError);

#[derive(serde::Serialize)]
pub struct LengthValue {
    length: usize,
}

pub struct ExpectedLength(usize);

impl ErrorProperty for ExpectedLength {
    type Value<'a> = Option<LengthValue>;

    fn key() -> &'static str {
        "expected"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack
            .next()
            .map(|Self(inner)| LengthValue { length: *inner })
    }
}

pub struct ReceivedLength(usize);

impl ErrorProperty for ReceivedLength {
    type Value<'a> = Option<LengthValue>;

    fn key() -> &'static str {
        "received"
    }

    fn value<'a>(mut stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        stack
            .next()
            .map(|Self(inner)| LengthValue { length: *inner })
    }
}

#[derive(Debug)]
pub struct ArrayItemsCountError;

impl Error for ArrayItemsCountError {
    type Properties = (Location, ExpectedLength, ReceivedLength);

    const ID: Id = id!("array", "items", "count");
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

        if let Some(LengthValue { length }) = expected {
            fmt.write_fmt(format_args!("expected array of length {length}"))?;
        }

        if has_expected && has_received {
            fmt.write_str(", but ")?;
        }

        if let Some(LengthValue { length }) = received {
            fmt.write_fmt(format_args!("received array of length {length}"))?;
        }

        if !has_expected && !has_received {
            Display::fmt(self, fmt)?;
        }

        Ok(())
    }
}

impl Display for ArrayItemsCountError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("received more items than requested")
    }
}

impl_error!(ArrayItemsCountError);
