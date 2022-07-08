use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::types::schema::{Uri, ValidationError};

/// Will serialize as a constant field `"object"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ObjectTypeTag {
    Object,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ObjectRepr<V> {
    r#type: ObjectTypeTag,
    properties: HashMap<Uri, V>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    required: Vec<Uri>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "ObjectRepr<V>", rename_all = "camelCase")]
pub struct Object<V, const MIN: usize = 0> {
    #[serde(flatten)]
    repr: ObjectRepr<V>,
}

impl<V, const MIN: usize> Object<V, MIN> {
    /// Creates a new `Object` without validating.
    #[must_use]
    pub fn new_unchecked(
        properties: impl Into<HashMap<Uri, V>>,
        required: impl Into<Vec<Uri>>,
    ) -> Self {
        Self {
            repr: ObjectRepr {
                r#type: ObjectTypeTag::Object,
                properties: properties.into(),
                required: required.into(),
            },
        }
    }

    /// Creates a new `Object` with the given properties and required properties.
    ///
    /// # Errors
    ///
    /// - [`ValidationError::PropertyRequired`] if a required property is not a key in `properties`.
    /// - [`ValidationError::PropertyMissing`] if the number properties is less than `MIN`.
    pub fn new(
        properties: impl Into<HashMap<Uri, V>>,
        required: impl Into<Vec<Uri>>,
    ) -> Result<Self, ValidationError> {
        let object = Self::new_unchecked(properties, required);
        object.validate()?;
        Ok(object)
    }

    fn validate(&self) -> Result<(), ValidationError> {
        let num_properties = self.properties().len();
        if num_properties < MIN {
            return Err(ValidationError::PropertyMissing(MIN, num_properties));
        }
        for uri in self.required() {
            if !self.properties().contains_key(uri) {
                return Err(ValidationError::PropertyRequired(uri.clone()));
            }
        }
        Ok(())
    }

    pub const fn properties(&self) -> &HashMap<Uri, V> {
        &self.repr.properties
    }

    pub fn required(&self) -> &[Uri] {
        &self.repr.required
    }
}

impl<V, const MIN: usize> TryFrom<ObjectRepr<V>> for Object<V, MIN> {
    type Error = ValidationError;

    fn try_from(object: ObjectRepr<V>) -> Result<Self, ValidationError> {
        Self::new(object.properties, object.required)
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use super::*;
    use crate::types::schema::tests::{check, check_invalid_json};

    mod unconstrained {
        use super::*;
        type Object = super::Object<String, 0>;

        #[test]
        fn empty() -> Result<(), Box<dyn Error>> {
            check(
                &Object::new([], [])?,
                json!({
                    "type": "object",
                    "properties": {}
                }),
            )?;
            Ok(())
        }

        #[test]
        fn one() -> Result<(), Box<dyn Error>> {
            check(
                &Object::new(
                    [(
                        Uri::new("https://example.com/property_type"),
                        "value".to_owned(),
                    )],
                    [],
                )?,
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type": "value",
                    }
                }),
            )?;
            Ok(())
        }

        #[test]
        fn multiple() -> Result<(), Box<dyn Error>> {
            check(
                &Object::new(
                    [
                        (
                            Uri::new("https://example.com/property_type_a"),
                            "value_a".to_owned(),
                        ),
                        (
                            Uri::new("https://example.com/property_type_b"),
                            "value_b".to_owned(),
                        ),
                    ],
                    [],
                )?,
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type_a": "value_a",
                        "https://example.com/property_type_b": "value_b",
                    }
                }),
            )?;
            Ok(())
        }
    }

    mod constrained {
        use super::*;
        type Object = super::Object<String, 1>;

        #[test]
        fn empty() {
            check_invalid_json::<Object>(json!({
                "type": "object",
                "properties": {}
            }));
        }

        #[test]
        fn one() -> Result<(), Box<dyn Error>> {
            check(
                &Object::new(
                    [(
                        Uri::new("https://example.com/property_type"),
                        "value".to_owned(),
                    )],
                    [],
                )?,
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type": "value",
                    }
                }),
            )?;
            Ok(())
        }

        #[test]
        fn multiple() -> Result<(), Box<dyn Error>> {
            check(
                &Object::new(
                    [
                        (
                            Uri::new("https://example.com/property_type_a"),
                            "value_a".to_owned(),
                        ),
                        (
                            Uri::new("https://example.com/property_type_b"),
                            "value_b".to_owned(),
                        ),
                    ],
                    [],
                )?,
                json!({
                    "type": "object",
                    "properties": {
                        "https://example.com/property_type_a": "value_a",
                        "https://example.com/property_type_b": "value_b",
                    }
                }),
            )?;
            Ok(())
        }
    }

    #[test]
    fn required() -> Result<(), Box<dyn Error>> {
        check(
            &Object::<String>::new(
                [
                    (
                        Uri::new("https://example.com/property_type_a"),
                        "value_a".to_owned(),
                    ),
                    (
                        Uri::new("https://example.com/property_type_b"),
                        "value_b".to_owned(),
                    ),
                ],
                [Uri::new("https://example.com/property_type_a")],
            )?,
            json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type_a": "value_a",
                    "https://example.com/property_type_b": "value_b",
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
        check_invalid_json::<Object<String>>(json!({
            "type": "object",
            "properties": {
                "https://example.com/property_type_a": "value_a",
                "https://example.com/property_type_b": "value_b",
            },
            "additional_properties": 10
        }));
    }

    #[test]
    fn invalid_required() {
        check_invalid_json::<Object<String>>(json!({
            "type": "object",
            "properties": {
                "https://example.com/property_type_a": "value_a",
                "https://example.com/property_type_b": "value_b",
            },
            "required": [
                "https://example.com/property_type_c"
            ]
        }));
    }
}
