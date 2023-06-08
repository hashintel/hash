use core::fmt::{Display, Formatter};

use crate::{
    error::{ErrorProperties, Id, Location, Namespace, Variant, NAMESPACE},
    id,
};

// TODO: name set_size?
#[derive(Debug)]
pub enum BoundedContractViolationError {
    SetDirty,
    SetCalledMultipleTimes,
    EndRemainingItems,
}

impl Display for BoundedContractViolationError {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::SetDirty => f.write_str("unable to set bounds after calling `.next()`"),
            Self::SetCalledMultipleTimes => {
                f.write_str("cannot call `set_bounded()` multiple times")
            }
            Self::EndRemainingItems => {
                f.write_str("`.next()` was not called exactly `n` times before calling `.end()`")
            }
        }
    }
}

impl Variant for BoundedContractViolationError {
    type Properties = (Location,);

    const ID: Id = id!["internal", "access", "bound"];
    const NAMESPACE: Namespace = NAMESPACE;

    fn message(
        &self,
        fmt: &mut Formatter,
        _properties: &<Self::Properties as ErrorProperties>::Value<'_>,
    ) -> core::fmt::Result {
        Display::fmt(&self, fmt)
    }
}
