#![cfg_attr(not(feature = "std"), no_std)]
#![cfg_attr(nightly, feature(provide_any, error_in_core))]
// TODO: once more stable introduce: warning missing_docs, clippy::missing_errors_doc
#![deny(unsafe_code)]
mod array;
mod deserializer;
mod error;
mod number;
mod object;
mod skip;
mod token;

extern crate alloc;

use deer::{error::DeserializeError, Context, Deserialize};
use error_stack::Result;

pub use crate::deserializer::{Deserializer, StackLimit};

pub fn from_slice<'de, T>(slice: &'de [u8], context: &Context) -> Result<T, DeserializeError>
where
    T: Deserialize<'de>,
{
    let mut deserializer = Deserializer::new(slice, context);

    T::deserialize(&mut deserializer)
}

pub fn from_str<'de, T>(value: &'de str, context: &Context) -> Result<T, DeserializeError>
where
    T: Deserialize<'de>,
{
    let mut deserializer = Deserializer::new(value.as_bytes(), context);

    T::deserialize(&mut deserializer)
}
