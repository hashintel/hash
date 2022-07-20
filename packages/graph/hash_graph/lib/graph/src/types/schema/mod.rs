//! Schema definitions stored in the [`store`].
//!
//! This module contains the definitions of schemas, which means that the serialized structs are not
//! the actual data but only the specification how a type is defined.
//!
//! [`store`]: crate::store

mod array;
mod combinator;
mod data_type;
mod entity_type;
mod link_type;
mod object;
mod property_type;

use core::fmt;

#[doc(inline)]
pub use self::{
    data_type::{DataType, DataTypeReference},
    entity_type::{EntityType, EntityTypeReference},
    link_type::LinkType,
    property_type::{PropertyType, PropertyTypeReference},
};
use crate::types::{BaseUri, VersionedUri};

#[derive(Debug)]
pub enum ValidationError {
    /// A schema has marked a property with a [`BaseUri`] as required but the [`BaseUri`] does not
    /// exist in the `properties`.
    MissingRequiredProperty(BaseUri),
    /// When associating a property name with a reference to a Type, we expect the name to match
    /// the [`VersionedUri::base_uri`] inside the reference.
    ///
    /// [`VersionedUri::base_uri`]: crate::types::VersionedUri::base_uri
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

#[cfg(test)]
mod tests {
    use std::fmt::Debug;

    use serde::{Deserialize, Serialize};

    /// Will serialize as a constant value `"string"`
    #[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub(super) enum StringTypeTag {
        #[default]
        String,
    }

    #[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct StringTypeStruct {
        r#type: StringTypeTag,
    }

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
