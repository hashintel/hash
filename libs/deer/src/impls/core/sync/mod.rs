#[cfg(nightly)]
use core::sync::Exclusive;

#[cfg(nightly)]
use crate::{Deserialize, Deserializer, error::DeserializeError};

mod atomic;
use error_stack::Report;

#[cfg(nightly)]
impl<'de, T> Deserialize<'de> for Exclusive<T>
where
    T: Deserialize<'de>,
{
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        T::deserialize(deserializer).map(Self::new)
    }
}
