use core::{
    fmt::{Display, Formatter},
    sync::atomic::{AtomicBool, Ordering},
};

use deer::{
    error::{Error, ErrorProperties, Id, Location, Namespace, ReceivedValue},
    id,
};

use crate::macros::impl_error;

const NAMESPACE: Namespace = Namespace::new("deer-json");

#[derive(Debug)]
pub(crate) struct BytesUnsupportedError;

impl Display for BytesUnsupportedError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("deer-json does not support deserialization of bytes")
    }
}

impl_error!(BytesUnsupportedError);

impl Error for BytesUnsupportedError {
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

static INIT: AtomicBool = AtomicBool::new(false);

// TODO: once #1396 is merged call `register!()`
pub(crate) fn init() {
    // Ordering does not matter here, because we it does not matter if we execute this once or
    // twice.
    if INIT
        .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
        .is_err()
    {
        return;
    }

    todo!()
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

impl_error!(OverflowError);

impl Error for OverflowError {
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
