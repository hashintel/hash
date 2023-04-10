use core::cmp::{Ordering, Reverse};

use error_stack::Result;

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Reverse<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        T::deserialize(de).map(Reverse)
    }
}
