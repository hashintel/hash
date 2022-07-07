use serde::{Deserialize, Serialize};

use crate::types::schema::ValidationError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ArrayTypeTag {
    Array,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Array<T> {
    r#type: ArrayTypeTag,
    items: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_items: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_items: Option<usize>,
}

impl<T> Array<T> {
    /// Creates a new `Array` from the given `items`, `min_items` and `max_items`.
    #[must_use]
    pub fn new<A: Into<Option<usize>>, B: Into<Option<usize>>>(
        items: T,
        min_items: A,
        max_items: B,
    ) -> Self {
        Self {
            r#type: ArrayTypeTag::Array,
            items,
            min_items: min_items.into(),
            max_items: max_items.into(),
        }
    }

    #[must_use]
    pub const fn items(&self) -> &T {
        &self.items
    }

    #[must_use]
    pub const fn min_items(&self) -> Option<usize> {
        self.min_items
    }

    #[must_use]
    pub const fn max_items(&self) -> Option<usize> {
        self.max_items
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ValueOrArray<T> {
    Value(T),
    Array(Array<T>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    try_from = "OneOfRepr<T>",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub struct OneOf<T> {
    one_of: Vec<T>,
}

impl<T> OneOf<T> {
    /// Creates a new `OneOf` without validating.
    pub fn new_unchecked<U: Into<Vec<T>>>(one_of: U) -> Self {
        Self {
            one_of: one_of.into(),
        }
    }

    /// Creates a new `OneOf` from the given vector.
    ///
    /// # Errors
    ///
    /// - [`ValidationError`] if the object is not in a valid state.
    pub fn new<U: Into<Vec<T>>>(one_of: U) -> Result<Self, ValidationError> {
        let one_of = Self::new_unchecked(one_of);
        one_of.validate()?;
        Ok(one_of)
    }

    #[must_use]
    pub fn one_of(&self) -> &[T] {
        &self.one_of
    }

    fn validate(&self) -> Result<(), ValidationError> {
        if self.one_of.is_empty() {
            return Err(ValidationError::OneOfEmpty);
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OneOfRepr<T> {
    one_of: Vec<T>,
}

impl<T> TryFrom<OneOfRepr<T>> for OneOf<T> {
    type Error = ValidationError;

    fn try_from(one_of: OneOfRepr<T>) -> Result<Self, Self::Error> {
        Self::new(one_of.one_of)
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use super::*;
    use crate::types::schema::Uri;

    #[test]
    fn array() -> Result<(), Box<dyn Error>> {
        let array = Array::new(Uri::new("https://example.com/data_type"), None, None);

        let json = serde_json::to_value(&array)?;
        assert_eq!(
            json,
            serde_json::json!({
                "type": "array",
                "items": "https://example.com/data_type",
            })
        );

        let array2 = serde_json::from_value(json)?;
        assert_eq!(array, array2);

        let array = Array::new(Uri::new("https://example.com/data_type"), 1, 2);

        let json = serde_json::to_value(&array)?;
        assert_eq!(
            json,
            serde_json::json!({
                "type": "array",
                "items": "https://example.com/data_type",
                "minItems": 1,
                "maxItems": 2,
            })
        );

        let array2 = serde_json::from_value(json)?;
        assert_eq!(array, array2);

        let json = json!({
            "items": "https://example.com/data_type"
        });
        assert!(serde_json::from_value::<Array<Uri>>(json).is_err());

        let json = json!({
            "type": "array",
            "items": "https://example.com/data_type",
            "minItems": 1
        });
        assert!(serde_json::from_value::<Array<Uri>>(json).is_ok());

        let json = json!({
            "type": "array",
            "items": "https://example.com/data_type",
            "maxItems": 1
        });
        assert!(serde_json::from_value::<Array<Uri>>(json).is_ok());

        let json = json!({
            "type": "array",
            "minItems": 2,
            "maxItems": 1
        });
        assert!(serde_json::from_value::<Array<Uri>>(json).is_err());

        let json = json!({
            "type": "array",
            "items": "https://example.com/data_type",
            "numItems": 1,
        });
        assert!(serde_json::from_value::<Array<Uri>>(json).is_err());

        Ok(())
    }

    #[test]
    fn one_or_many_single() -> Result<(), Box<dyn Error>> {
        let one = ValueOrArray::Value(Uri::new("https://example.com/data_type"));

        let json = serde_json::to_value(&one)?;
        assert_eq!(json, serde_json::json!("https://example.com/data_type"));

        let one2 = serde_json::from_value(json)?;
        assert_eq!(one, one2);

        Ok(())
    }

    #[test]
    fn one_or_many_array() -> Result<(), Box<dyn Error>> {
        let array = ValueOrArray::Array(Array::new(
            Uri::new("https://example.com/data_type"),
            None,
            None,
        ));

        let json = serde_json::to_value(&array)?;
        assert_eq!(
            json,
            serde_json::json!({
                "type": "array",
                "items": "https://example.com/data_type",
            })
        );

        let array2 = serde_json::from_value(json)?;
        assert_eq!(array, array2);

        Ok(())
    }

    #[test]
    fn one_of() -> Result<(), Box<dyn Error>> {
        let one = OneOf::new([Uri::new("https://example.com/data_type")])?;

        let json = serde_json::to_value(&one)?;
        assert_eq!(
            json,
            serde_json::json!({ "oneOf": ["https://example.com/data_type"] })
        );

        let one2 = serde_json::from_value(json)?;
        assert_eq!(one, one2);

        Ok(())
    }

    #[test]
    fn one_of_validation() {
        let json = json!({ "oneOf": [] });
        assert!(serde_json::from_value::<OneOf<Uri>>(json).is_err());
    }
}
