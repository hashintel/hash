#[cfg(nightly)]
use core::sync::Exclusive;

use crate::{error::DeserializeError, Deserialize, Deserializer};

mod atomic;

#[cfg(nightly)]
impl<'de, T> Deserialize<'de> for Exclusive<T>
where
    T: Deserialize<'de>,
{
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        T::deserialize(de).map(Self::new)
    }
}
