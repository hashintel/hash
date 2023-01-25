use core::cmp::Reverse;

use crate::{error::DeserializeError, Deserialize, Deserializer};

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Reverse<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        T::deserialize(de).map(Reverse)
    }
}
