#![cfg_attr(not(feature = "std"), no_std)]
// TODO: once more stable introduce: warning missing_docs, clippy::missing_errors_doc
#![deny(unsafe_code)]
#![expect(clippy::missing_errors_doc)]

mod array;
mod deserializer;
mod error;
mod number;
mod object;
mod skip;
mod token;

extern crate alloc;

use deer::{Context, Deserialize, error::DeserializeError};
use error_stack::Report;

pub use crate::deserializer::{Deserializer, StackLimit};

pub fn from_slice<'de, T>(
    slice: &'de [u8],
    context: &Context,
) -> Result<T, Report<DeserializeError>>
where
    T: Deserialize<'de>,
{
    let mut deserializer = Deserializer::new(slice, context);

    T::deserialize(&mut deserializer)
}

pub fn from_str<'de, T>(value: &'de str, context: &Context) -> Result<T, Report<DeserializeError>>
where
    T: Deserialize<'de>,
{
    let mut deserializer = Deserializer::new(value.as_bytes(), context);

    T::deserialize(&mut deserializer)
}
