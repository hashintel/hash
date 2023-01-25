#[cfg(nightly)]
use core::sync::Exclusive;

use error_stack::Result;

use crate::{error::DeserializeError, Deserialize, Deserializer};

#[cfg(nightly)]
impl<'de, T: Deserialize<'de>> Deserialize<'de> for Exclusive<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        T::deserialize(de).map(Self::new)
    }
}
