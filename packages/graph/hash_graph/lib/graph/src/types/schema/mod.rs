mod helper;
pub mod properties;
mod reference;

use core::fmt;

pub trait Validate {
    /// Validates the schema of the object.
    ///
    /// This does only check the validity of this object, not it's child data. A validation also
    /// happens when the type is created.
    ///
    /// # Errors
    ///
    /// - [`ValidationError`] if the object is not in a valid state.
    fn validate(&self) -> Result<(), ValidationError>;
}

#[doc(inline)]
pub use self::{
    helper::{Array, OneOf, OneOrMany},
    properties::PropertyType,
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
                write!(fmt, "Required field {uri} is not used in `properties`")
            }
            Self::OneOfEmpty => fmt.write_str("`one_of` must have at least one item"),
        }
    }
}

impl std::error::Error for ValidationError {}
