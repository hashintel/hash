#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::{string::String, vec::Vec};

use super::ErrorProperty;

#[derive(Debug, serde::Serialize)]
#[serde(tag = "type", content = "value")]
#[serde(rename_all = "lowercase")]
pub enum Location {
    /// Index of something tuple-like, like tuple of tuple struct.
    Tuple(usize),
    /// Index of something array-like, like slice, or [`Vec`]
    Array(usize),
    /// Static field of a struct or enum variant
    Field(&'static str),
    /// Entry in a `HashMap` or equivalent, for anything that has a variable amount of keys/values.
    Entry(String),
    /// Name of an enum variant
    Variant(&'static str),
}

impl ErrorProperty for Location {
    type Value<'a> = Vec<&'a Self>;

    fn key() -> &'static str {
        "location"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        // location is used a bit differently, this value "bubbles" up, meaning the location is
        // attached from bottom to top
        stack.collect()
    }
}
