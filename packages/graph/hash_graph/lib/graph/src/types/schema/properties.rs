#![allow(
    clippy::use_self,
    reason = "Weird false positive on `PropertyValues` which somehow can't be disabled locally"
)]

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::types::schema::{
    Array, DataTypeReference, OneOf, OneOrMany, PropertyTypeReference, Uri, Validate,
    ValidationError,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    try_from = "PropertyTypeObjectRepr",
    tag = "type",
    rename = "object",
    rename_all = "camelCase"
)]
pub struct PropertyTypeObject {
    /// Property names must be a valid URI to a property-type
    properties: HashMap<Uri, OneOrMany<PropertyTypeReference>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    required: Vec<Uri>,
}

impl PropertyTypeObject {
    /// Creates a new `PropertyTypeObject` without validating.
    #[must_use]
    pub const fn new_unchecked(
        properties: HashMap<Uri, OneOrMany<PropertyTypeReference>>,
        required: Vec<Uri>,
    ) -> Self {
        Self {
            properties,
            required,
        }
    }

    /// Creates a new `PropertyTypeObject` with the given properties and required properties.
    ///
    /// # Errors
    ///
    /// - [`ValidationError::PropertyMissing`] if a required property is not a key in `properties`.
    pub fn new(
        properties: HashMap<Uri, OneOrMany<PropertyTypeReference>>,
        required: Vec<Uri>,
    ) -> Result<Self, ValidationError> {
        let object = Self::new_unchecked(properties, required);
        object.validate()?;
        Ok(object)
    }
}

impl Validate for PropertyTypeObject {
    fn validate(&self) -> Result<(), ValidationError> {
        for uri in &self.required {
            if !self.properties.contains_key(uri) {
                return Err(ValidationError::PropertyMissing(uri.clone()));
            }
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum ObjectTypeTag {
    Object,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PropertyTypeObjectRepr {
    #[serde(rename = "type")]
    _type: ObjectTypeTag,
    /// Property names must be a valid URI to a property-type
    properties: HashMap<Uri, OneOrMany<PropertyTypeReference>>,
    #[serde(default)]
    required: Vec<Uri>,
}

impl TryFrom<PropertyTypeObjectRepr> for PropertyTypeObject {
    type Error = ValidationError;

    fn try_from(object: PropertyTypeObjectRepr) -> Result<Self, ValidationError> {
        Self::new(object.properties, object.required)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropertyValues {
    PropertyTypeObject(PropertyTypeObject),
    DataTypeReference(DataTypeReference),
    PropertyTypeValues(Array<OneOf<Self>>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    try_from = "PropertyTypeRepr",
    tag = "kind",
    rename = "propertyType",
    rename_all = "camelCase"
)]
pub struct PropertyType {
    #[serde(rename = "$id")]
    id: Uri,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(flatten)]
    one_of: OneOf<PropertyValues>,
}

impl PropertyType {
    /// Creates a new `PropertyType` without validating.
    #[must_use]
    pub const fn new_unchecked(
        id: Uri,
        title: String,
        description: Option<String>,
        one_of: OneOf<PropertyValues>,
    ) -> Self {
        Self {
            id,
            title,
            description,
            one_of,
        }
    }

    /// Creates a new `PropertyType`.
    ///
    /// # Errors
    ///
    /// - [`ValidationError`] if validation is failing.
    pub fn new(
        id: Uri,
        title: String,
        description: Option<String>,
        one_of: OneOf<PropertyValues>,
    ) -> Result<Self, ValidationError> {
        let property_type = Self::new_unchecked(id, title, description, one_of);
        property_type.validate()?;
        Ok(property_type)
    }

    #[must_use]
    pub const fn id(&self) -> &Uri {
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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum PropertyTypeTag {
    PropertyType,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyTypeRepr {
    #[serde(rename = "kind")]
    _type: PropertyTypeTag,
    #[serde(rename = "$id")]
    id: Uri,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(flatten)]
    one_of: OneOf<PropertyValues>,
}

impl TryFrom<PropertyTypeRepr> for PropertyType {
    type Error = ValidationError;

    fn try_from(property_type: PropertyTypeRepr) -> Result<Self, ValidationError> {
        Self::new(
            property_type.id,
            property_type.title,
            property_type.description,
            property_type.one_of,
        )
    }
}

impl Validate for PropertyType {
    fn validate(&self) -> Result<(), ValidationError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use super::*;
    use crate::types::schema::Array;

    #[test]
    fn one_object() -> Result<(), Box<dyn Error>> {
        let object = PropertyTypeObject {
            properties: [(
                Uri::new("https://example.com/property_type")?,
                OneOrMany::One(PropertyTypeReference::new(Uri::new(
                    "https://example.com/property_type",
                )?)?),
            )]
            .into_iter()
            .collect(),
            required: vec![],
        };

        let json = serde_json::to_value(&object)?;
        assert_eq!(
            json,
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type": {
                        "$ref": "https://example.com/property_type"
                    },
                }
            })
        );

        let object2 = serde_json::from_value(json)?;
        assert_eq!(object, object2);

        Ok(())
    }

    #[test]
    fn many_objects() -> Result<(), Box<dyn Error>> {
        let object = PropertyTypeObject {
            properties: [(
                Uri::new("https://example.com/property_type")?,
                OneOrMany::Array(Array::new(
                    PropertyTypeReference::new(Uri::new("https://example.com/property_type")?)?,
                    None,
                    None,
                )?),
            )]
            .into_iter()
            .collect(),
            required: vec![],
        };

        let json = serde_json::to_value(&object)?;
        assert_eq!(
            json,
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type": {
                        "type": "array",
                        "items": {
                            "$ref": "https://example.com/property_type"
                        }
                    },
                }
            })
        );

        let object2 = serde_json::from_value(json)?;
        assert_eq!(object, object2);

        Ok(())
    }

    #[test]
    fn required_object() -> Result<(), Box<dyn Error>> {
        let object = PropertyTypeObject {
            properties: [(
                Uri::new("https://example.com/property_type")?,
                OneOrMany::One(PropertyTypeReference::new(Uri::new(
                    "https://example.com/property_type",
                )?)?),
            )]
            .into_iter()
            .collect(),
            required: vec![Uri::new("https://example.com/property_type")?],
        };

        let json = serde_json::to_value(&object)?;
        assert_eq!(
            json,
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type": {
                        "$ref": "https://example.com/property_type"
                    },
                },
                "required": ["https://example.com/property_type"]
            })
        );

        let object2 = serde_json::from_value(json)?;
        assert_eq!(object, object2);

        Ok(())
    }

    #[test]
    fn validate_object() {
        let json = json!({
            "type": "object",
            "properties": {
                "https://example.com/property_type": {
                    "$ref": "https://example.com/property_type"
                },
            },
            "required": ["https://example.com/property_type"]
        });
        assert!(serde_json::from_value::<PropertyTypeObject>(json).is_ok());

        let json = json!({
            "type": "object",
            "properties": {
                "https://example.com/property_type": {
                    "$ref": "https://example.com/property_type"
                },
            },
            "required": ["https://example.com/property_type_2"]
        });
        assert!(serde_json::from_value::<PropertyTypeObject>(json).is_err());
    }

    #[test]
    fn property_value_object() -> Result<(), Box<dyn Error>> {
        let object = PropertyValues::PropertyTypeObject(PropertyTypeObject {
            properties: [(
                Uri::new("https://example.com/property_type")?,
                OneOrMany::One(PropertyTypeReference::new(Uri::new(
                    "https://example.com/property_type",
                )?)?),
            )]
            .into_iter()
            .collect(),
            required: vec![],
        });

        let json = serde_json::to_value(&object)?;
        assert_eq!(
            json,
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type": {
                        "$ref": "https://example.com/property_type"
                    },
                }
            })
        );

        let object2 = serde_json::from_value(json)?;
        assert_eq!(object, object2);

        Ok(())
    }

    #[test]
    fn property_value_reference() -> Result<(), Box<dyn Error>> {
        let object = PropertyValues::DataTypeReference(DataTypeReference::new(Uri::new(
            "https://example.com/property_type",
        )?)?);

        let json = serde_json::to_value(&object)?;
        assert_eq!(
            json,
            json!({
                "$ref": "https://example.com/property_type"
            })
        );

        let object2 = serde_json::from_value(json)?;
        assert_eq!(object, object2);

        Ok(())
    }

    #[test]
    fn property_values() -> Result<(), Box<dyn Error>> {
        let object = PropertyValues::PropertyTypeValues(Array::new(
            OneOf::new([PropertyValues::DataTypeReference(DataTypeReference::new(
                Uri::new("https://example.com/property_type")?,
            )?)])?,
            None,
            None,
        )?);

        let json = serde_json::to_value(&object)?;
        assert_eq!(
            json,
            json!({
                "type": "array",
                "items": {
                    "oneOf": [
                        {
                            "$ref": "https://example.com/property_type"
                        }
                    ]
                }
            })
        );

        let object2 = serde_json::from_value(json)?;
        assert_eq!(object, object2);

        Ok(())
    }

    mod property_type {
        use super::*;

        fn test_property_type_schema(schema: serde_json::Value) {
            serde_json::from_value::<PropertyType>(schema).expect("Not a valid schema");
        }

        #[test]
        fn favorite_quote() {
            test_property_type_schema(json!({
              "kind": "propertyType",
              "$id": "https://blockprotocol.org/types/@alice/property-type/favorite-quote",
              "title": "Favorite Quote",
              "oneOf": [
                { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text" }
              ]
            }));
        }

        #[test]
        fn age() {
            test_property_type_schema(json!({
              "kind": "propertyType",
              "$id": "https://blockprotocol.org/types/@alice/property-type/age",
              "title": "Age",
              "oneOf": [
                {
                  "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/Number"
                }
              ]
            }));
        }

        #[test]
        fn user_id() {
            test_property_type_schema(json!({
              "kind": "propertyType",
              "$id": "https://blockprotocol.org/types/@alice/property-type/user-id",
              "title": "User ID",
              "oneOf": [
                { "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/text" },
                {
                  "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number"
                }
              ]
            }));
        }

        #[test]
        fn contact_information() {
            test_property_type_schema(json!({
              "kind": "propertyType",
              "$id": "https://blockprotocol.org/types/@alice/property-type/contact-information",
              "title": "Contact Information",
              "oneOf": [
                {
                  "type": "object",
                  "properties": {
                    "https://blockprotocol.org/types/@blockprotocol/property-type/email": {
                      "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/email"
                    },
                    "https://blockprotocol.org/types/@blockprotocol/property-type/phone-number": {
                      "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/phone-number"
                    }
                  },
                  "required": [
                    "https://blockprotocol.org/types/@blockprotocol/property-type/email"
                  ]
                }
              ]
            }));
        }

        #[test]
        fn interests() {
            test_property_type_schema(json!({
              "kind": "propertyType",
              "$id": "https://blockprotocol.org/types/@alice/property-type/interests",
              "title": "Interests",
              "oneOf": [
                {
                  "type": "object",
                  "properties": {
                    "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-film": {
                      "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-film"
                    },
                    "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-song": {
                      "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/favorite-song"
                    },
                    "https://blockprotocol.org/types/@blockprotocol/property-type/hobby": {
                      "type": "array",
                      "items": {
                        "$ref": "https://blockprotocol.org/types/@blockprotocol/property-type/hobby"
                      }
                    }
                  }
                }
              ]
            }));
        }

        #[test]
        fn numbers() {
            test_property_type_schema(json!({
              "kind": "propertyType",
              "$id": "https://blockprotocol.org/types/@alice/property-type/numbers",
              "title": "Numbers",
              "oneOf": [
                {
                  "type": "array",
                  "items": {
                    "oneOf": [
                      {
                        "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number"
                      }
                    ]
                  }
                }
              ]
            }));
        }

        #[test]
        fn contrived_property() {
            test_property_type_schema(json!({
              "kind": "propertyType",
              "$id": "https://blockprotocol.org/types/@alice/property-type/contrived-property",
              "title": "Contrived Property",
              "oneOf": [
                {
                  "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number"
                },
                {
                  "type": "array",
                  "items": {
                    "oneOf": [
                      {
                        "$ref": "https://blockprotocol.org/types/@blockprotocol/data-type/number"
                      }
                    ]
                  },
                  "maxItems": 4
                }
              ]
            }));
        }
    }
}
