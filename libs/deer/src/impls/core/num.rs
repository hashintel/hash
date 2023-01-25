#[cfg(nightly)]
use core::num::Saturating;
use core::num::Wrapping;

use crate::{error::DeserializeError, Deserialize, Deserializer};

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Wrapping<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        T::deserialize(de).map(Self)
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Saturating<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        T::deserialize(de).map(Self)
    }
}
