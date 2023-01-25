#[cfg(nightly)]
use core::cell::LazyCell;
use core::cell::OnceCell;

use crate::{error::DeserializeError, Deserialize, Deserializer, Document, Reflection, Schema};

impl<T> Reflection for OnceCell<T>
where
    T: Reflection,
{
    fn schema(doc: &mut Document) -> Schema {
        T::schema(doc)
    }
}

impl<'de, T> Deserialize<'de> for OnceCell<T>
where
    T: Deserialize<'de>,
{
    type Reflection = T::Reflection;

    fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
        T::deserialize(de).map(Self::from)
    }
}

// #[cfg(nightly)]
// impl<T> Reflection for LazyCell<T>
// where
//     T: Reflection,
// {
//     fn schema(doc: &mut Document) -> Schema {
//         T::schema(doc)
//     }
// }
//
// #[cfg(nightly)]
// impl<'de, T> Deserialize<'de> for LazyCell<T>
// where
//     T: Deserialize<'de>,
// {
//     type Reflection = T::Reflection;
//
//     fn deserialize<D: Deserializer<'de>>(de: D) -> error_stack::Result<Self, DeserializeError> {
//         // todo
//         T::deserialize(de).map(|value| LazyCell::new(|| value))
//     }
// }
