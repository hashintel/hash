use core::mem::ManuallyDrop;

use error_stack::Report;

use crate::{Deserialize, Deserializer, error::DeserializeError};

impl<'de, T: Deserialize<'de>> Deserialize<'de> for ManuallyDrop<T> {
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        T::deserialize(deserializer).map(Self::new)
    }
}
