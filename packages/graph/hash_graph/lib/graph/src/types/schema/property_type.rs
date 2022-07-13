use std::collections::HashSet;

use error_stack::{ensure, Result};
use serde::{Deserialize, Serialize};

use crate::types::{
    schema::{
        array::{Array, Itemized},
        combinator::{OneOf, ValueOrArray},
        data_type::DataTypeReference,
        object::{Object, ValidateUri},
        ValidationError, VersionedUri,
    },
    BaseUri,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PropertyTypeReference {
    // TODO: Test if the URI is an actual property type
    #[serde(rename = "$ref")]
    reference: VersionedUri,
}

impl PropertyTypeReference {
    /// Creates a new `PropertyTypeReference` from the given `reference`.
    #[must_use]
    pub const fn new(reference: VersionedUri) -> Self {
        Self { reference }
    }

    #[must_use]
    pub const fn uri(&self) -> &VersionedUri {
        &self.reference
    }
}

impl ValidateUri for PropertyTypeReference {
    fn validate_uri(&self, base_uri: &BaseUri) -> Result<(), ValidationError> {
        ensure!(
            base_uri == self.reference.base_uri(),
            ValidationError::BaseUriMismatch {
                base_uri: base_uri.clone(),
                versioned_uri: self.reference.clone()
            }
        );
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
#[allow(clippy::enum_variant_names)]
pub enum PropertyValues {
    DataTypeReference(DataTypeReference),
    PropertyTypeObject(Object<ValueOrArray<PropertyTypeReference>, 1>),
    ArrayOfPropertyValues(Itemized<Array, OneOf<Self>>),
}

impl PropertyValues {
    #[must_use]
    fn data_type_references(&self) -> Vec<&DataTypeReference> {
        match self {
            Self::DataTypeReference(reference) => vec![reference],
            Self::ArrayOfPropertyValues(values) => values
                .items()
                .one_of()
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
                .items()
                .one_of()
                .iter()
                .flat_map(|value| value.property_type_references().into_iter())
                .collect(),
            Self::PropertyTypeObject(object) => object
                .properties()
                .values()
                .map(|value| match value {
                    ValueOrArray::Value(one) => one,
                    ValueOrArray::Array(array) => array.items(),
                })
                .collect(),
        }
    }
}

impl ValidateUri for PropertyValues {
    fn validate_uri(&self, base_uri: &BaseUri) -> Result<(), ValidationError> {
        match self {
            Self::DataTypeReference(reference) => reference.validate_uri(base_uri),
            _ => Ok(()),
        }
    }
}

/// Will serialize as a constant value `"propertyType"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::use_self)]
enum PropertyTypeTag {
    PropertyType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyType {
    kind: PropertyTypeTag,
    #[serde(rename = "$id")]
    id: VersionedUri,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(flatten)]
    one_of: OneOf<PropertyValues>,
}

impl PropertyType {
    /// Creates a new `PropertyType`.
    #[must_use]
    pub const fn new(
        id: VersionedUri,
        title: String,
        description: Option<String>,
        one_of: OneOf<PropertyValues>,
    ) -> Self {
        Self {
            kind: PropertyTypeTag::PropertyType,
            id,
            title,
            description,
            one_of,
        }
    }

    #[must_use]
    pub const fn id(&self) -> &VersionedUri {
        &self.id
    }

    #[must_use]
    pub fn title(&self) -> &str {
        &self.title
    }

    #[must_use]
    pub fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    #[must_use]
    pub fn one_of(&self) -> &[PropertyValues] {
        self.one_of.one_of()
    }

    #[must_use]
    pub fn data_type_references(&self) -> HashSet<&DataTypeReference> {
        self.one_of
            .one_of()
            .iter()
            .flat_map(|value| value.data_type_references().into_iter())
            .collect()
    }

    #[must_use]
    pub fn property_type_references(&self) -> HashSet<&PropertyTypeReference> {
        self.one_of
            .one_of()
            .iter()
            .flat_map(|value| value.property_type_references().into_iter())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use serde_json::json;

    use super::*;

    fn test_property_type_schema(schema: &serde_json::Value) -> PropertyType {
        let property_type: PropertyType =
            serde_json::from_value(schema.clone()).expect("invalid schema");
        assert_eq!(
            serde_json::to_value(property_type.clone()).expect("Could not serialize"),
            *schema,
            "{property_type:#?}"
        );
        property_type
    }

    fn test_property_type_data_refs(
        property_type: &PropertyType,
        uris: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_data_type_references = uris
            .into_iter()
            .map(|uri| VersionedUri::from_str(uri).expect("Invalid URI"))
            .collect::<HashSet<_>>();

        let data_type_references = property_type
            .data_type_references()
            .into_iter()
            .map(DataTypeReference::uri)
            .cloned()
            .collect::<HashSet<_>>();

        assert_eq!(data_type_references, expected_data_type_references);
    }

    fn test_property_type_property_refs(
        property_type: &PropertyType,
        uris: impl IntoIterator<Item = &'static str>,
    ) {
        let expected_property_references = uris
            .into_iter()
            .map(ToString::to_string)
            .collect::<HashSet<_>>();

        let property_references = property_type
            .property_type_references()
            .into_iter()
            .map(|reference| reference.uri().to_string())
            .collect::<HashSet<_>>();

        assert_eq!(property_references, expected_property_references);
    }

    #[test]
    fn favorite_quote() {
        let property_type = test_property_type_schema(&json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/favorite-quote/v/1",
          "title": "Favorite Quote",
          "oneOf": [
            { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text/v/1" }
          ]
        }));

        test_property_type_data_refs(&property_type, [
            "https://blockprotocol.org/types/@blockprotocol/data-type/text/v/1",
        ]);

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn age() {
        let property_type = test_property_type_schema(&json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/age/v/1",
          "title": "Age",
          "oneOf": [
            {
              "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1"
            }
          ]
        }));

        test_property_type_data_refs(&property_type, [
            "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1",
        ]);

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn user_id() {
        let property_type = test_property_type_schema(&json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/user-id/v/1",
          "title": "User ID",
          "oneOf": [
            { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text/v/1" },
            {
              "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1"
            }
          ]
        }));

        test_property_type_data_refs(&property_type, [
            "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1",
            "https://blockprotocol.org/types/@blockprotocol/data-type/text/v/1",
        ]);

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn contact_information() {
        let property_type = test_property_type_schema(&json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/contact-information/v/1",
          "title": "Contact Information",
          "oneOf": [
            {
              "type": "object",
              "properties": {
                "https://blockprotocol.org/types/@blockprotocol/property-type/email": {
                  "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/email/v/1"
                },
                "https://blockprotocol.org/types/@blockprotocol/property-type/phone-number": {
                  "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/phone-number/v/1"
                }
              },
              "required": [
                "https://blockprotocol.org/types/@blockprotocol/property-type/email"
              ]
            }
          ]
        }));

        test_property_type_data_refs(&property_type, []);

        test_property_type_property_refs(&property_type, [
            "https://blockprotocol.org/types/@blockprotocol/property-type/email/v/1",
            "https://blockprotocol.org/types/@blockprotocol/property-type/phone-number/v/1",
        ]);
    }

    #[test]
    fn interests() {
        let property_type = test_property_type_schema(&json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/interests/v/1",
          "title": "Interests",
          "oneOf": [
            {
              "type": "object",
              "properties": {
                "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-film": {
                  "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-film/v/1"
                },
                "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-song": {
                  "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-song/v/1"
                },
                "https://blockprotocol.org/types/@blockprotocol/property-type/hobby": {
                  "type": "array",
                  "items": {
                    "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/hobby/v/1"
                  }
                }
              }
            }
          ]
        }));

        test_property_type_data_refs(&property_type, []);

        test_property_type_property_refs(&property_type, [
            "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-film/v/1",
            "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-song/v/1",
            "https://blockprotocol.org/types/@blockprotocol/property-type/hobby/v/1",
        ]);
    }

    #[test]
    fn numbers() {
        let property_type = test_property_type_schema(&json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/numbers/v/1",
          "title": "Numbers",
          "oneOf": [
            {
              "type": "array",
              "items": {
                "oneOf": [
                  {
                    "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1"
                  }
                ]
              }
            }
          ]
        }));

        test_property_type_data_refs(&property_type, [
            "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1",
        ]);

        test_property_type_property_refs(&property_type, []);
    }

    #[test]
    fn contrived_property() {
        let property_type = test_property_type_schema(&json!({
          "kind": "propertyType",
          "$id": "https://blockprotocol.org/types/@alice/property-type/contrived-property/v/1",
          "title": "Contrived Property",
          "oneOf": [
            {
              "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1"
            },
            {
              "type": "array",
              "items": {
                "oneOf": [
                  {
                    "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1"
                  }
                ]
              },
              "maxItems": 4
            }
          ]
        }));

        test_property_type_data_refs(&property_type, [
            "https://blockprotocol.org/types/@blockprotocol/data-type/number/v/1",
        ]);

        test_property_type_property_refs(&property_type, []);
    }
}
