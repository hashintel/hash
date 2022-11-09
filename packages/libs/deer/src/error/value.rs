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

    const ID: Id = id!("value");
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        properties: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> fmt::Result {
        let (_, expected, _) = properties;

        let expected = expected
            .and_then(|ExpectedType(inner)| inner.get("type"))
            .map(|ty| format!("value has correct type ({ty}), but does not fit constraints."));

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
