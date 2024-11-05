use core::cell::{Cell, RefCell, UnsafeCell};
#[cfg(nightly)]
use core::cell::{OnceCell, SyncUnsafeCell};

use error_stack::Report;

use crate::{Deserialize, Deserializer, Document, Reflection, Schema, error::DeserializeError};

macro_rules! impl_cell {
    ($(#[$attr:meta])* $cell:ident) => {
        $(#[$attr])*
        impl<T> Reflection for $cell<T>
        where
            T: Reflection,
        {
            fn schema(doc: &mut Document) -> Schema {
                T::schema(doc)
            }
        }

        $(#[$attr])*
        impl<'de, T> Deserialize<'de> for $cell<T>
        where
            T: Deserialize<'de>,
        {
            type Reflection = T::Reflection;

            fn deserialize<D: Deserializer<'de>>(
                deserializer: D,
            ) -> Result<Self, Report<DeserializeError>> {
                T::deserialize(deserializer).map(Self::from)
            }
        }
    };

    ($($(#[$attr:meta])* $cell:ident),+ $(,)?) => {
        $(impl_cell!($(#[$attr])* $cell);)*
    };
}

impl_cell![
    #[cfg(nightly)]
    OnceCell,
    #[cfg(nightly)]
    SyncUnsafeCell,
    Cell,
    RefCell,
    UnsafeCell
];
