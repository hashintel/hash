use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::types::schema::{Uri, ValidationError};

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
