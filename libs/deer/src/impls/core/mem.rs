use core::mem::ManuallyDrop;

use error_stack::Result;

use crate::{error::DeserializeError, Deserialize, Deserializer, Document, Reflection, Schema};

impl<'de, T: Deserialize<'de>> Deserialize<'de> for ManuallyDrop<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        T::deserialize(de).map(Self::new)
    }
}
