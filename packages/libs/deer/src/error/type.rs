use core::fmt::Formatter;

use super::{Error, ErrorProperties, NAMESPACE};
use crate::{error::Location, id, Id, Namespace};

pub struct ExpectedType {}

pub struct ReceivedType {}

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
            .and_then(|expected| expected.0.get("type"))
            .map(|ty| format!("expected value of type {ty}"));

        let received = received
            .and_then(|received| received.0.get("type"))
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
