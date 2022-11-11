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
    type Value<'a> = Option<&'a Self>
        where Self: 'a;

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
    type Value<'a> = Option<&'a Self>
        where Self: 'a;

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
            .map(|ty| format!("received value of type {ty}"));

        match (expected, received) {
            (Some(expected), Some(received)) => {
                fmt.write_fmt(format_args!("{expected}, {received}"))
            }
            (Some(message), None) | (None, Some(message)) => fmt.write_str(&message),
            (None, None) => Display::fmt(self, fmt),
        }
    }
}

impl Display for TypeError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("mismatch between expected type and type of received value")
    }
}

impl_error!(TypeError);
