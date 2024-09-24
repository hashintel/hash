#[cfg(nightly)]
use core::sync::Exclusive;

#[cfg(nightly)]
use crate::{Deserialize, Deserializer, error::DeserializeError};

mod atomic;

#[cfg(nightly)]
impl<'de, T> Deserialize<'de> for Exclusive<T>
where
    T: Deserialize<'de>,
{
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> error_stack::Result<Self, DeserializeError> {
        T::deserialize(deserializer).map(Self::new)
    }
}
