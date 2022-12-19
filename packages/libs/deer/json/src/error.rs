use core::fmt::{Display, Formatter};

use deer::{
    error::{ErrorProperties, Id, Location, Namespace, ReceivedValue, Variant},
    id,
};

const NAMESPACE: Namespace = Namespace::new("deer-json");

#[derive(Debug)]
pub(crate) struct BytesUnsupportedError;

impl Display for BytesUnsupportedError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("deer-json does not support deserialization of bytes")
    }
}

impl Variant for BytesUnsupportedError {
    type Properties = (Location,);

    const ID: Id = id!["bytes"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        _: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> core::fmt::Result {
        fmt.write_str("deer-json does not support deserialization of bytes")
    }
}

#[derive(Debug)]
pub(crate) struct OverflowError;

impl Display for OverflowError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str(
            "received a number that was either too large or too small and could not be processed",
        )
    }
}

impl Variant for OverflowError {
    type Properties = (Location, ReceivedValue);

    const ID: Id = id!["number", "overflow"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        _: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> core::fmt::Result {
        Display::fmt(&self, fmt)?;

        #[cfg(debug_assertions)]
        fmt.write_str(", try enabling the `arbitrary-precision` feature")?;

        Ok(())
    }
}

#[derive(Debug)]
pub(crate) enum SetBoundedError {
    Dirty,
    CalledMultipleTimes,
}

impl Display for SetBoundedError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Dirty => f.write_str("unable to set bounds after calling `.next()`"),
            Self::CalledMultipleTimes => f.write_str("cannot call set_bounds() multiple times"),
        }
    }
}

impl Variant for SetBoundedError {
    type Properties = (Location,);

    const ID: Id = id!["internal", "access", "set_bounds"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message<'a>(
        &self,
        fmt: &mut Formatter,
        _: &<Self::Properties as ErrorProperties>::Value<'a>,
    ) -> core::fmt::Result {
        Display::fmt(&self, fmt)
    }
}
