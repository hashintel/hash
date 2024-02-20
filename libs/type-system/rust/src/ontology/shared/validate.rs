use std::{
    error::Error,
    fmt,
    fmt::{Display, Formatter},
};

use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::url::{BaseUrl, VersionedUrl};

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "inner")]
pub enum ValidationError {
    /// A schema has marked a property with a [`BaseUrl`] as required but the [`BaseUrl`] does not
    /// exist in the `properties`.
    MissingRequiredProperty(BaseUrl),
    /// When associating a property name with a reference to a Type, we expect the name to match
    /// the [`VersionedUrl::base_url`] inside the reference.
    BaseUrlMismatch {
        base_url: BaseUrl,
        versioned_url: VersionedUrl,
    },
    /// A schema has marked a link as required but the link does not exist in the schema.
    MissingRequiredLink(VersionedUrl),
    /// At least `expected` number of properties are required, but only `actual` were provided.
    MismatchedPropertyCount { actual: usize, expected: usize },
    /// `oneOf` requires at least one element.
    EmptyOneOf,
}

impl Display for ValidationError {
    fn fmt(&self, fmt: &mut Formatter) -> fmt::Result {
        match self {
            Self::MissingRequiredProperty(url) => {
                write!(
                    fmt,
                    "the schema has marked the \"{url}\" property as required, but it wasn't \
                     defined in the `\"properties\"` object"
                )
            }
            Self::BaseUrlMismatch {
                base_url,
                versioned_url,
            } => {
                write!(
                    fmt,
                    "expected base URL ({base_url}) differed from the base URL of \
                     ({versioned_url})"
                )
            }
            Self::MissingRequiredLink(link) => {
                write!(
                    fmt,
                    "the schema has marked the \"{link}\" link as required, but it wasn't defined \
                     in the `\"links\"` object"
                )
            }
            Self::MismatchedPropertyCount { actual, expected } => {
                write!(
                    fmt,
                    "at least {expected} properties are required, but only {actual} were provided"
                )
            }
            Self::EmptyOneOf => fmt.write_str("`\"one_of\"` must have at least one item"),
        }
    }
}

impl Error for ValidationError {}

pub trait ValidateUrl {
    /// TODO: DOC
    ///
    /// # Errors
    fn validate_url(&self, base_url: &BaseUrl) -> Result<(), ValidationError>;
}
