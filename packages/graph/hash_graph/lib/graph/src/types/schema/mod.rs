//! Schema definitions stored in the [`datastore`].
//!
//! This module contains the definitions of schemas, which means that the serialized structs are not
//! the actual data but only the specification how a type is defined.
//!
//! [`datastore`]: crate::datastore

mod array;
mod combinator;
mod data_type;
mod entity_type;
mod link;
mod object;
mod property_type;

use core::fmt;

#[doc(inline)]
pub use self::{data_type::DataType, entity_type::EntityType, property_type::PropertyType};
use crate::types::{BaseUri, VersionedUri};

#[derive(Debug)]
pub enum ValidationError {
    /// A schema has marked a property with a [`BaseUri`] as required but the [`BaseUri`] does not
    /// exist in the `properties`.
    MissingRequiredProperty(BaseUri),
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
                    "The schema has marked the \"{uri}\" property as required, but it wasn't \
                     defined in the `\"properties\"` object"
                )
            }
            Self::MissingRequiredLink(link) => {
                write!(
                    fmt,
                    "The schema has marked the \"{link}\" link as required, but it wasn't defined \
                     in the `\"links\"` object"
                )
            }
            Self::MismatchedPropertyCount { actual, expected } => {
                write!(
                    fmt,
                    "At least {expected} properties are required, but only {actual} were provided"
                )
            }
            Self::EmptyOneOf => fmt.write_str("`\"one_of\"` must have at least one item"),
        }
    }
}

impl std::error::Error for ValidationError {}

#[cfg(test)]
mod tests {
    use std::fmt::Debug;

    use serde::{Deserialize, Serialize};

    pub(super) fn check_serialization<T>(
        value: &T,
        json: &serde_json::Value,
    ) -> Result<(), serde_json::Error>
    where
        T: Debug + PartialEq + Serialize,
    {
        let serialized_json = serde_json::to_value(value)?;
        assert_eq!(
            &serialized_json, json,
            "Serialized value does not match expected JSON",
        );

        Ok(())
    }

    pub(super) fn check_deserialization<T>(
        value: &T,
        json: serde_json::Value,
    ) -> Result<(), serde_json::Error>
    where
        for<'de> T: Debug + PartialEq + Deserialize<'de>,
    {
        let deserialized_json = serde_json::from_value::<T>(json)?;
        assert_eq!(
            &deserialized_json, value,
            "Deserialized JSON does not match expected value",
        );

        Ok(())
    }

    pub(super) fn check<T>(value: &T, json: serde_json::Value) -> Result<(), serde_json::Error>
    where
        for<'de> T: Debug + PartialEq + Serialize + Deserialize<'de>,
    {
        check_serialization(value, &json)?;
        check_deserialization(value, json)?;
        Ok(())
    }

    pub(super) fn check_invalid_json<T>(json: serde_json::Value)
    where
        for<'de> T: Debug + Deserialize<'de>,
    {
        serde_json::from_value::<T>(json)
            .expect_err("JSON was expected to be invalid but it was accepted");
    }
}
