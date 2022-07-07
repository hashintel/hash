pub mod array;
pub mod combinator;
mod data_type;
mod object;
pub mod property_type;

use core::fmt;

#[doc(inline)]
pub use self::{
    combinator::{OneOf, ValueOrArray},
    data_type::DataType,
    property_type::PropertyType,
};
use crate::types::Uri;

#[derive(Debug)]
pub enum ValidationError {
    PropertyRequired(Uri),
    PropertyMissing(usize, usize),
    OneOfEmpty,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::PropertyRequired(uri) => {
                write!(
                    fmt,
                    "The schema has marked the \"{uri}\" property as required, but it wasn't \
                     defined in the `\"properties\"` object"
                )
            }
            Self::PropertyMissing(expected, actual) => {
                write!(
                    fmt,
                    "At least {expected} properties are required, but only {actual} were provided"
                )
            }
            Self::OneOfEmpty => fmt.write_str("`\"one_of\"` must have at least one item"),
        }
    }
}

impl std::error::Error for ValidationError {}
