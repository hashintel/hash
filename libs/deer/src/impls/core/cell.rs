#[cfg(nightly)]
use core::cell::OnceCell;
#[cfg(nightly)]
use core::cell::SyncUnsafeCell;
use core::cell::{Cell, RefCell, UnsafeCell};

use crate::{error::DeserializeError, Deserialize, Deserializer, Document, Reflection, Schema};

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
                de: D,
            ) -> error_stack::Result<Self, DeserializeError> {
                T::deserialize(de).map(Self::from)
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
