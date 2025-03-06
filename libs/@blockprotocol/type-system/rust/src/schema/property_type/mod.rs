//! # Property Types
//!
//! This module defines property types in the Block Protocol Type System. Property types
//! are reusable definitions that specify the structure and constraints for properties
//! that can be attached to entities.
//!
//! ## Core Concepts
//!
//! A [`PropertyType`] defines:
//!
//! - A unique identifier (`id`) as a [`VersionedUrl`]
//! - A title and optional plural title
//! - A description of the property's purpose
//! - A set of possible value structures via `one_of`
//!
//! ## Property Value Structures
//!
//! Property types can reference three different value structures:
//!
//! 1. **Data Type References** - Direct references to data types (e.g., a string or number)
//! 2. **Property Type Objects** - Object structures with nested property type references
//! 3. **Arrays of Property Values** - Collections of property values
//!
//! This flexibility allows for complex property definitions, from simple primitive values
//! to nested structures and arrays.
//!
//! ## Example Use Cases
//!
//! - **Simple Properties**: A "name" property referencing a text data type
//! - **Complex Properties**: A "contact" property with nested "email" and "phone" properties
//! - **Array Properties**: A "tags" property containing an array of text values
//!
//! ## Validation Process
//!
//! The [`PropertyTypeValidator`] validates values against property types:
//!
//! 1. It checks if the value matches any of the `one_of` possibilities
//! 2. For data type references, it delegates to the data type validator
//! 3. For object structures, it validates each property against its definition
//! 4. For arrays, it validates each item against the array item definition
//!
//! ## Type Resolution
//!
//! Property types can reference both data types and other property types, creating
//! a network of dependencies that must be resolved during validation.
//!
//! ## Example
//!
//! A property type with multiple possible value types:
//!
//! ```
//! use serde_json::json;
//! use type_system::schema::PropertyType;
//!
//! // Define a property type that can be either a string or a number
//! let user_id_json = json!({
//!   "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
//!   "kind": "propertyType",
//!   "$id": "https://example.com/types/property-type/user-id/v/1",
//!   "title": "User ID",
//!   "description": "An identifier for a user, which can be either a string or a number",
//!   "oneOf": [
//!     { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" },
//!     { "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1" }
//!   ]
//! });
//!
//! // Parse the property type
//! let user_id = serde_json::from_value::<PropertyType>(user_id_json).expect("Failed to parse property type");
//!
//! // Check basic properties
//! assert_eq!(user_id.id.to_string(), "https://example.com/types/property-type/user-id/v/1");
//! assert_eq!(user_id.title, "User ID");
//!
//! // This property type accepts multiple data types via oneOf
//! assert_eq!(user_id.one_of.len(), 2);
//!
//! // Demonstrate how to check data type references
//! let data_refs = user_id.data_type_references();
//! assert_eq!(data_refs.len(), 2);
//!
//! // Check there are no nested property types
//! let property_refs = user_id.property_type_references();
//! assert!(property_refs.is_empty());
//! ```

pub use self::{
    reference::PropertyTypeReference,
    validation::{PropertyTypeValidationError, PropertyTypeValidator},
};

mod raw;
mod reference;
mod validation;

use std::collections::HashSet;

use serde::{Deserialize, Serialize, Serializer};

use crate::{
    schema::{
        DataTypeReference, OneOfSchema, PropertyValueArray, PropertyValueObject, ValueOrArray,
    },
    url::VersionedUrl,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(try_from = "raw::PropertyType")]
pub struct PropertyType {
    pub id: VersionedUrl,
    pub title: String,
    pub title_plural: Option<String>,
    pub description: String,
    pub one_of: Vec<PropertyValues>,
}

impl PropertyType {
    #[must_use]
    pub fn data_type_references(&self) -> HashSet<&DataTypeReference> {
        self.one_of
            .iter()
            .flat_map(|value| value.data_type_references().into_iter())
            .collect()
    }

    #[must_use]
    pub fn property_type_references(&self) -> HashSet<&PropertyTypeReference> {
        self.one_of
            .iter()
            .flat_map(|value| value.property_type_references().into_iter())
            .collect()
    }
}

impl Serialize for PropertyType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::PropertyType::from(self).serialize(serializer)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(
    untagged,
    expecting = "Expected a data type reference, a property type object, or an array of property \
                 values"
)]
pub enum PropertyValues {
    DataTypeReference(DataTypeReference),
    PropertyTypeObject(PropertyValueObject<ValueOrArray<PropertyTypeReference>>),
    ArrayOfPropertyValues(PropertyValueArray<OneOfSchema<PropertyValues>>),
}

#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case")]
pub enum PropertyValueType {
    Value,
    Array,
    Object,
}

impl PropertyValues {
    #[must_use]
    fn data_type_references(&self) -> Vec<&DataTypeReference> {
        match self {
            Self::DataTypeReference(reference) => vec![reference],
            Self::ArrayOfPropertyValues(values) => values
                .items
                .possibilities
                .iter()
                .flat_map(|value| value.data_type_references().into_iter())
                .collect(),
            Self::PropertyTypeObject(_) => vec![],
        }
    }

    #[must_use]
    fn property_type_references(&self) -> Vec<&PropertyTypeReference> {
        match self {
            Self::DataTypeReference(_) => vec![],
            Self::ArrayOfPropertyValues(values) => values
                .items
                .possibilities
                .iter()
                .flat_map(Self::property_type_references)
                .collect(),
            Self::PropertyTypeObject(object) => object
                .properties
                .values()
                .map(|value| match value {
                    ValueOrArray::Value(one) => one,
                    ValueOrArray::Array(array) => &array.items,
                })
                .collect(),
        }
    }

    #[must_use]
    pub const fn property_value_type(&self) -> PropertyValueType {
        match self {
            Self::DataTypeReference(_) => PropertyValueType::Value,
            Self::PropertyTypeObject(_) => PropertyValueType::Object,
            Self::ArrayOfPropertyValues(_) => PropertyValueType::Array,
        }
    }
}

pub trait PropertyValueSchema {
    fn possibilities(&self) -> &[PropertyValues];
}

impl PropertyValueSchema for &PropertyType {
    fn possibilities(&self) -> &[PropertyValues] {
        &self.one_of
    }
}

impl PropertyValueSchema for OneOfSchema<PropertyValues> {
    fn possibilities(&self) -> &[PropertyValues] {
        &self.possibilities
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use serde_json::json;

    use super::*;
    use crate::{
        schema::property_type::validation::{PropertyTypeValidationError, PropertyTypeValidator},
        url::BaseUrl,
        utils::tests::{
            JsonEqualityCheck, ensure_failed_deserialization, ensure_failed_validation,
            ensure_validation_from_str,
        },
    };

    fn test_property_type_data_refs(
        property_type: &PropertyType,
        urls: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_data_type_references = urls
            .into_iter()
            .map(|url| VersionedUrl::from_str(url).expect("invalid URL"))
            .collect::<HashSet<_>>();

        let data_type_references = property_type
            .data_type_references()
            .into_iter()
            .map(|data_type_ref| &data_type_ref.url)
            .cloned()
            .collect::<HashSet<_>>();

        assert_eq!(data_type_references, expected_data_type_references);
    }

    fn test_property_type_property_refs(
        property_type: &PropertyType,
        urls: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_property_type_references = urls
            .into_iter()
            .map(|url| VersionedUrl::from_str(url).expect("invalid URL"))
            .collect::<HashSet<_>>();

        let property_type_references = property_type
            .property_type_references()
            .into_iter()
            .map(|property_type_ref| property_type_ref.url.clone())
            .collect::<HashSet<_>>();

        assert_eq!(property_type_references, expected_property_type_references);
    }

    #[tokio::test]
    async fn favorite_quote() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::FAVORITE_QUOTE_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[tokio::test]
    async fn age() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::AGE_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[tokio::test]
    async fn user_id() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::USER_ID_V2,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            [
                "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            ],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[tokio::test]
    async fn contact_information() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::CONTACT_INFORMATION_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(&property_type, []);

        test_property_type_property_refs(
            &property_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/email/v/1",
                "https://blockprotocol.org/@alice/types/property-type/phone-number/v/1",
            ],
        );
    }

    #[tokio::test]
    async fn interests() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::INTERESTS_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(&property_type, []);

        test_property_type_property_refs(
            &property_type,
            [
                "https://blockprotocol.org/@alice/types/property-type/favorite-film/v/1",
                "https://blockprotocol.org/@alice/types/property-type/favorite-song/v/1",
                "https://blockprotocol.org/@alice/types/property-type/hobby/v/1",
            ],
        );
    }

    #[tokio::test]
    async fn numbers() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::NUMBERS_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[tokio::test]
    async fn contrived_property() {
        let property_type = ensure_validation_from_str::<PropertyType, _>(
            hash_graph_test_data::property_type::CONTRIVED_PROPERTY_V1,
            PropertyTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        test_property_type_data_refs(
            &property_type,
            ["https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"],
        );

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn invalid_id() {
        ensure_failed_deserialization::<PropertyType>(
            json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/",
                  "title": "Age",
                  "description": "The age of a person.",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"
                    }
                  ]
                }
            ),
            &"missing version",
        );
    }

    #[test]
    fn invalid_metaschema() {
        let invalid_schema_url = "https://blockprotocol.org/types/modules/graph/0.3/schema/foo";
        ensure_failed_deserialization::<PropertyType>(
            json!(
                {
                  "$schema": invalid_schema_url,
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "description": "The age of a person.",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1"
                    }
                  ]
                }
            ),
            &"unknown variant `https://blockprotocol.org/types/modules/graph/0.3/schema/foo`, expected `https://blockprotocol.org/types/modules/graph/0.3/schema/property-type`",
        );
    }

    #[test]
    fn invalid_reference() {
        ensure_failed_deserialization::<PropertyType>(
            json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "description": "The age of a person.",
                  "oneOf": [
                    {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/number"
                    }
                  ]
                }
            ),
            &"Expected a data type reference, a property type object, or an array of property \
              values",
        );
    }

    #[tokio::test]
    async fn empty_one_of() {
        assert!(matches!(
            ensure_failed_validation::<PropertyType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/age/v/1",
                  "title": "Age",
                  "description": "The age of a person.",
                  "oneOf": []
                }),
                PropertyTypeValidator,
                JsonEqualityCheck::Yes
            )
            .await,
            PropertyTypeValidationError::OneOfValidationFailed(_)
        ));
    }

    #[tokio::test]
    async fn invalid_property_object() {
        let key = BaseUrl::new(
            "https://blockprotocol.org/@alice/types/property-type/phone-numbers/".to_owned(),
        )
        .expect("invalid URL");
        let versioned_url = VersionedUrl::from_str(
            "https://blockprotocol.org/@alice/types/property-type/phone-number/v/1",
        )
        .expect("invalid URL");

        assert!(matches!(
            ensure_failed_validation::<PropertyType, _>(
                json!({
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
                  "kind": "propertyType",
                  "$id": "https://blockprotocol.org/@alice/types/property-type/contact-information/v/1",
                  "title": "Contact Information",
                  "description": "A contact information property type that can be either an email or a phone number.",
                  "oneOf": [
                    {
                      "type": "object",
                      "properties": {
                        key.to_string(): {
                          "$ref": versioned_url.to_string()
                        }
                      }
                    }
                  ]
                }),
                PropertyTypeValidator,
                JsonEqualityCheck::Yes
            )
            .await,
            PropertyTypeValidationError::InvalidPropertyReference { base_url, reference } if key == base_url && reference.url == versioned_url
        ));
    }
}
