mod data_type;
mod helper;
pub mod property_type;
mod reference;

use core::fmt;

trait Validate {
    /// Semantically validates the schema of the object.
    ///
    /// This does only check the validity of this object, not it's child data. A validation
    /// automatically happens, when a type is created by `Self::new` or by deserializing the type.
    ///
    /// # Errors
    ///
    /// - [`ValidationError`] if the object is not in a valid state.
    fn validate(&self) -> Result<(), ValidationError>;
}

#[doc(inline)]
pub use self::{
    data_type::DataType,
    helper::{Array, OneOf, ValueOrArray},
    property_type::PropertyType,
    reference::{DataTypeReference, PropertyTypeReference, Uri},
};

#[derive(Debug)]
pub enum ValidationError {
    PropertyMissing(Uri),
    OneOfEmpty,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::PropertyMissing(uri) => {
                write!(
                    fmt,
                    "The schema has marked the \"{uri}\" property as required, but it wasn't \
                     defined in the `\"properties\"` object"
                )
            }
            Self::OneOfEmpty => fmt.write_str("`\"one_of\"` must have at least one item"),
        }
    }
}

impl std::error::Error for ValidationError {}
