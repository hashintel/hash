use core::mem::ManuallyDrop;

use error_stack::Result;

use crate::{error::DeserializeError, Deserialize, Deserializer, Document, Reflection, Schema};

impl<T: Reflection + ?Sized> Reflection for ManuallyDrop<T> {
    fn schema(doc: &mut Document) -> Schema {
        T::schema(doc)
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for ManuallyDrop<T> {
    type Reflection = ManuallyDrop<T::Reflection>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        T::deserialize(de).map(Self::new)
    }
}
