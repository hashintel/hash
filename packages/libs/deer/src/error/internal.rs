use core::fmt::{Display, Formatter};

use crate::{
    error::{ErrorProperties, Id, Location, Namespace, Variant, NAMESPACE},
    id,
};

#[derive(Debug)]
pub enum SetBoundedError {
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
