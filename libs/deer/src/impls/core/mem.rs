use core::mem::ManuallyDrop;

use error_stack::Result;

use crate::{error::DeserializeError, Deserialize, Deserializer};

impl<'de, T: Deserialize<'de>> Deserialize<'de> for ManuallyDrop<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, DeserializeError> {
        T::deserialize(deserializer).map(Self::new)
    }
}
