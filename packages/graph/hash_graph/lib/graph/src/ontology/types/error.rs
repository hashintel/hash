use std::fmt;

use crate::ontology::types::uri::{BaseUri, VersionedUri};

#[derive(Debug)]
pub enum ValidationError {
    /// A schema has marked a property with a [`BaseUri`] as required but the [`BaseUri`] does not
    /// exist in the `properties`.
    MissingRequiredProperty(BaseUri),
    /// The entity specifies a property which is not defined in its schema.
    UnknownProperty(BaseUri),
    /// When associating a property name with a reference to a Type, we expect the name to match
    /// the [`VersionedUri::base_uri`] inside the reference.
    BaseUriMismatch {
        base_uri: BaseUri,
        versioned_uri: VersionedUri,
    },
    /// A schema has marked a link as required but the link does not exist in the schema.
    MissingRequiredLink(VersionedUri),
    /// At least `expected` number of properties are required, but only `actual` were provided.
    MismatchedPropertyCount { actual: usize, expected: usize },
    /// `oneOf` requires at least one element.
    EmptyOneOf,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::MissingRequiredProperty(uri) => {
                write!(
                    fmt,
                    "the schema has marked the \"{uri}\" property as required, but it wasn't \
                     defined in the `\"properties\"` object"
                )
            }
            Self::UnknownProperty(uri) => {
                write!(
                    fmt,
                    "the entity specifies the \"{uri}\" property but it wasn't defined in the \
                     entity type schema object"
                )
            }
            Self::BaseUriMismatch {
                base_uri,
                versioned_uri,
            } => {
                write!(
                    fmt,
                    "expected base URI ({base_uri}) differed from the base URI of \
                     ({versioned_uri})"
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

impl std::error::Error for ValidationError {}
