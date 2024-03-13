pub(crate) mod error;
pub(in crate::ontology) mod raw;

use std::collections::{HashMap, HashSet};

use crate::{url::BaseUrl, ValidateUrl, ValidationError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Object<T, const MIN: usize = 0> {
    pub(crate) properties: HashMap<BaseUrl, T>,
    pub(crate) required: HashSet<BaseUrl>,
}

impl<T: ValidateUrl, const MIN: usize> Object<T, MIN> {
    /// Creates a new `Object` with the given properties and required properties.
    ///
    /// # Errors
    ///
    /// - [`ValidationError::MissingRequiredProperty`] if a required property is not a key in
    ///   `properties`.
    /// - [`ValidationError::MismatchedPropertyCount`] if the number of properties is less than
    ///   `MIN`.
    pub fn new(
        properties: HashMap<BaseUrl, T>,
        required: HashSet<BaseUrl>,
    ) -> Result<Self, ValidationError> {
        let object = Self::new_unchecked(properties, required);
        object.validate()?;
        Ok(object)
    }

    fn validate(&self) -> Result<(), ValidationError> {
        let num_properties = self.properties().len();
        if num_properties < MIN {
            return Err(ValidationError::MismatchedPropertyCount {
                actual: num_properties,
                expected: MIN,
            });
        };

        for url in self.required() {
            if !self.properties().contains_key(url) {
                return Err(ValidationError::MissingRequiredProperty(url.clone()));
            }
        }

        for (base_url, reference) in self.properties() {
            reference.validate_url(base_url)?;
        }

        Ok(())
    }
}

impl<T, const MIN: usize> Object<T, MIN> {
    /// Creates a new `Object` without validating.
    #[must_use]
    pub const fn new_unchecked(
        properties: HashMap<BaseUrl, T>,
        required: HashSet<BaseUrl>,
    ) -> Self {
        Self {
            properties,
            required,
        }
    }

    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUrl, T> {
        &self.properties
    }

    #[must_use]
    pub const fn required(&self) -> &HashSet<BaseUrl> {
        &self.required
    }
}

impl<T, const MIN: usize> Extend<Self> for Object<T, MIN> {
    fn extend<I: IntoIterator<Item = Self>>(&mut self, iter: I) {
        for property_object in iter {
            // TODO: We want to merge properties and bail on conflicting properties, however, we
            //       want to allow properties where the origin is the same entity type. For that it
            //       is necessary to track where a property comes from.
            //       Note, that this requires the full property type to be available and this
            //       function is only aware of the ID of the property type.
            //   see https://linear.app/hash/issue/H-860/improve-type-parent-validation
            self.properties.extend(property_object.properties);
            self.required.extend(property_object.required);
        }
    }
}

impl<T, const MIN: usize> FromIterator<Self> for Object<T, MIN> {
    fn from_iter<I: IntoIterator<Item = Self>>(iter: I) -> Self {
        let mut default = Self::default();
        default.extend(iter);
        default
    }
}

impl<T, const MIN: usize> Default for Object<T, MIN> {
    fn default() -> Self {
        Self {
            properties: HashMap::new(),
            required: HashSet::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use serde_json::json;

    use super::*;
    use crate::{
        raw, url::VersionedUrl, utils::tests::ensure_failed_validation,
        ParsePropertyTypeObjectError, PropertyTypeReference, ValueOrArray,
    };

    type ObjectRepr = raw::Object<raw::ValueOrArray<raw::PropertyTypeReference>>;
    type Object = super::Object<ValueOrArray<PropertyTypeReference>, 1>;

    #[test]
    fn empty() {
        ensure_failed_validation::<ObjectRepr, Object>(
            &json!({
                "type": "object",
                "properties": {}
            }),
            ParsePropertyTypeObjectError::ValidationError(
                ValidationError::MismatchedPropertyCount {
                    actual: 0,
                    expected: 1,
                },
            ),
        );
    }

    #[test]
    fn invalid_url() {
        ensure_failed_validation::<ObjectRepr, Object>(
            &json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type_a/": { "$ref": "https://example.com/property_type_b/v/1" }
                }
            }),
            ParsePropertyTypeObjectError::ValidationError(ValidationError::BaseUrlMismatch {
                base_url: BaseUrl::new("https://example.com/property_type_a/".to_owned())
                    .expect("failed to create BaseURI"),
                versioned_url: VersionedUrl::from_str("https://example.com/property_type_b/v/1")
                    .expect("failed to create VersionedUrl"),
            }),
        );
    }

    #[test]
    fn invalid_required() {
        ensure_failed_validation::<ObjectRepr, Object>(
            &json!({
                "type": "object",
                "properties": {
                    "https://example.com/property_type_a/": { "$ref": "https://example.com/property_type_a/v/1" },
                    "https://example.com/property_type_b/": { "$ref": "https://example.com/property_type_b/v/1" },
                },
                "required": [
                    "https://example.com/property_type_c/"
                ]
            }),
            ParsePropertyTypeObjectError::ValidationError(
                ValidationError::MissingRequiredProperty(
                    BaseUrl::new("https://example.com/property_type_c/".to_owned())
                        .expect("failed to create BaseURI"),
                ),
            ),
        );
    }
}
