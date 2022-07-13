use std::collections::HashMap;

use error_stack::{ensure, Result};
use serde::{de, Deserialize, Deserializer, Serialize};

use crate::types::{schema::ValidationError, BaseUri};

/// Will serialize as a constant value `"object"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ObjectTypeTag {
    Object,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ObjectRepr<V> {
    r#type: ObjectTypeTag,
    properties: HashMap<BaseUri, V>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    required: Vec<BaseUri>,
}

pub trait ValidateUri {
    fn validate_uri(&self, base_uri: &BaseUri) -> Result<(), ValidationError>;
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Object<V, const MIN: usize = 0> {
    #[serde(flatten)]
    repr: ObjectRepr<V>,
}

impl<V: ValidateUri, const MIN: usize> Object<V, MIN> {
    /// Creates a new `Object` without validating.
    #[must_use]
    pub fn new_unchecked(properties: HashMap<BaseUri, V>, required: Vec<BaseUri>) -> Self {
        Self {
            repr: ObjectRepr {
                r#type: ObjectTypeTag::Object,
                properties,
                required,
            },
        }
    }

    /// Creates a new `Object` with the given properties and required properties.
    ///
    /// # Errors
    ///
    /// - [`ValidationError::MissingRequiredProperty`] if a required property is not a key in
    ///   `properties`.
    /// - [`ValidationError::MismatchedPropertyCount`] if the number of properties is less than
    ///   `MIN`.
    pub fn new(
        properties: HashMap<BaseUri, V>,
        required: Vec<BaseUri>,
    ) -> Result<Self, ValidationError> {
        let object = Self::new_unchecked(properties, required);
        object.validate()?;
        Ok(object)
    }

    fn validate(&self) -> Result<(), ValidationError> {
        let num_properties = self.properties().len();
        ensure!(
            num_properties >= MIN,
            ValidationError::MismatchedPropertyCount {
                actual: num_properties,
                expected: MIN,
            }
        );

        for uri in self.required() {
            ensure!(
                self.properties().contains_key(uri),
                ValidationError::MissingRequiredProperty(uri.clone())
            );
        }
        for (base_uri, referenced) in self.properties() {
            referenced.validate_uri(base_uri)?;
        }

        Ok(())
    }

    pub const fn properties(&self) -> &HashMap<BaseUri, V> {
        &self.repr.properties
    }

    pub fn required(&self) -> &[BaseUri] {
        &self.repr.required
    }
}

impl<'de, V: ValidateUri + Deserialize<'de>, const MIN: usize> Deserialize<'de> for Object<V, MIN> {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let object = Self {
            repr: ObjectRepr::deserialize(deserializer)?,
        };
        object.validate().map_err(de::Error::custom)?;
        Ok(object)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::types::{
        schema::{
            property_type::PropertyTypeReference,
            tests::{check, check_invalid_json},
        },
        VersionedUri,
    };

    mod unconstrained {
        use super::*;
        type Object = super::Object<PropertyTypeReference, 0>;

        #[test]
        fn empty() -> Result<(), serde_json::Error> {
            check(
                &Object::new_unchecked(HashMap::new(), vec![]),
                json!({
                    "type": "object",
                    "properties": {}
                }),
            )?;
            Ok(())
        }

        #[test]
        fn one() -> Result<(), serde_json::Error> {
            let uri = VersionedUri::new("https://example.com/property_type".to_owned(), 1);
            check(
                &Object::new_unchecked(
                    HashMap::from([(uri.base_uri().clone(), PropertyTypeReference::new(uri))]),
                    vec![],
                ),
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type": { "$ref": "https://example.com/property_type/v/1" },
                    }
                }),
            )?;
            Ok(())
        }

        #[test]
        fn multiple() -> Result<(), serde_json::Error> {
            let uri_a = VersionedUri::new("https://example.com/property_type_a".to_owned(), 1);
            let uri_b = VersionedUri::new("https://example.com/property_type_b".to_owned(), 1);
            check(
                &Object::new_unchecked(
                    HashMap::from([
                        (uri_a.base_uri().clone(), PropertyTypeReference::new(uri_a)),
                        (uri_b.base_uri().clone(), PropertyTypeReference::new(uri_b)),
                    ]),
                    vec![],
                ),
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type_a": { "$ref": "https://example.com/property_type_a/v/1" },
                        "https://example.com/property_type_b": { "$ref": "https://example.com/property_type_b/v/1" },
                    }
                }),
            )?;
            Ok(())
        }
    }

    mod constrained {
        use super::*;
        use crate::types::VersionedUri;
        type Object = super::Object<PropertyTypeReference, 1>;

        #[test]
        fn empty() {
            check_invalid_json::<Object>(json!({
                "type": "object",
                "properties": {}
            }));
        }

        #[test]
        fn one() -> Result<(), serde_json::Error> {
            let uri = VersionedUri::new("https://example.com/property_type".to_owned(), 1);
            check(
                &Object::new_unchecked(
                    HashMap::from([(uri.base_uri().clone(), PropertyTypeReference::new(uri))]),
                    vec![],
                ),
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type": { "$ref": "https://example.com/property_type/v/1" },
                    }
                }),
            )?;
            Ok(())
        }

        #[test]
        fn multiple() -> Result<(), serde_json::Error> {
            let uri_a = VersionedUri::new("https://example.com/property_type_a".to_owned(), 1);
            let uri_b = VersionedUri::new("https://example.com/property_type_b".to_owned(), 1);
            check(
                &Object::new_unchecked(
                    HashMap::from([
                        (uri_a.base_uri().clone(), PropertyTypeReference::new(uri_a)),
                        (uri_b.base_uri().clone(), PropertyTypeReference::new(uri_b)),
                    ]),
                    vec![],
                ),
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type_a": { "$ref": "https://example.com/property_type_a/v/1" },
                        "https://example.com/property_type_b": { "$ref": "https://example.com/property_type_b/v/1" },
                    }
                }),
            )?;
            Ok(())
        }
    }

    #[test]
    fn required() -> Result<(), serde_json::Error> {
        let uri_a = VersionedUri::new("https://example.com/property_type_a".to_owned(), 1);
        let uri_b = VersionedUri::new("https://example.com/property_type_b".to_owned(), 1);
        check(
            &Object::<_, 0>::new_unchecked(
                HashMap::from([
                    (
                        uri_a.base_uri().clone(),
                        PropertyTypeReference::new(uri_a.clone()),
                    ),
                    (uri_b.base_uri().clone(), PropertyTypeReference::new(uri_b)),
                ]),
                vec![uri_a.base_uri().clone()],
            ),
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type_a": { "$ref": "https://example.com/property_type_a/v/1" },
                    "https://example.com/property_type_b": { "$ref": "https://example.com/property_type_b/v/1" },
                },
                "required": [
                    "https://example.com/property_type_a"
                ]
            }),
        )?;
        Ok(())
    }

    #[test]
    fn additional_properties() {
        check_invalid_json::<Object<PropertyTypeReference>>(json!({
            "type": "object",
            "properties": {
                "https://example.com/property_type_a": { "$ref": "https://example.com/property_type_a/v/1" },
                "https://example.com/property_type_b": { "$ref": "https://example.com/property_type_b/v/1" },
            },
            "additional_properties": 10
        }));
    }

    #[test]
    fn invalid_uri() {
        check_invalid_json::<Object<PropertyTypeReference>>(json!({
            "type": "object",
            "properties": {
                "https://example.com/property_type_a": { "$ref": "https://example.com/property_type_b/v/1" }
            }
        }));
    }

    #[test]
    fn invalid_required() {
        check_invalid_json::<Object<PropertyTypeReference>>(json!({
            "type": "object",
            "properties": {
                "https://example.com/property_type_a": { "$ref": "https://example.com/property_type_a/v/1" },
                "https://example.com/property_type_b": { "$ref": "https://example.com/property_type_b/v/1" },
            },
            "required": [
                "https://example.com/property_type_c"
            ]
        }));
    }
}
