use core::{
    fmt::{Display, Formatter},
    sync::atomic::{AtomicBool, Ordering},
};

use deer::{
    error::{Error, ErrorProperties, Id, Location, Namespace},
    id,
};
use error_stack::Context;

const NAMESPACE: Namespace = Namespace::new("deer-json");

#[derive(Debug)]
pub(crate) struct BytesUnsupportedError;

impl Display for BytesUnsupportedError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        f.write_str("deer-json does not support deserialization of bytes")
    }
}

impl Context for BytesUnsupportedError {}

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

// TODO: once
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
