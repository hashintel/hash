use serde::{Deserialize, Serialize};

use crate::types::schema::{array::TypedArray, ValidationError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Optional<T> {
    None {},
    Some(T),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ValueOrArray<T> {
    Value(T),
    Array(TypedArray<T>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OneOfRepr<T> {
    one_of: Vec<T>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "OneOfRepr<T>", rename_all = "camelCase")]
pub struct OneOf<T> {
    #[serde(flatten)]
    repr: OneOfRepr<T>,
}

impl<T> OneOf<T> {
    /// Creates a new `OneOf` without validating.
    pub fn new_unchecked<U: Into<Vec<T>>>(one_of: U) -> Self {
        Self {
            repr: OneOfRepr {
                one_of: one_of.into(),
            },
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
        &self.repr.one_of
    }

    fn validate(&self) -> Result<(), ValidationError> {
        if self.one_of().is_empty() {
            return Err(ValidationError::OneOfEmpty);
        }
        Ok(())
    }
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
        let array = TypedArray::new(Uri::new("https://example.com/data_type"), None, None);

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

        let array = TypedArray::new(Uri::new("https://example.com/data_type"), 1, 2);

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
        assert!(serde_json::from_value::<TypedArray<Uri>>(json).is_err());

        let json = json!({
            "type": "array",
            "items": "https://example.com/data_type",
            "minItems": 1
        });
        assert!(serde_json::from_value::<TypedArray<Uri>>(json).is_ok());

        let json = json!({
            "type": "array",
            "items": "https://example.com/data_type",
            "maxItems": 1
        });
        assert!(serde_json::from_value::<TypedArray<Uri>>(json).is_ok());

        let json = json!({
            "type": "array",
            "minItems": 2,
            "maxItems": 1
        });
        assert!(serde_json::from_value::<TypedArray<Uri>>(json).is_err());

        let json = json!({
            "type": "array",
            "items": "https://example.com/data_type",
            "numItems": 1,
        });
        assert!(serde_json::from_value::<TypedArray<Uri>>(json).is_err());

        Ok(())
    }

    #[test]
    fn value_or_array_value() -> Result<(), Box<dyn Error>> {
        let one = ValueOrArray::Value(Uri::new("https://example.com/data_type"));

        let json = serde_json::to_value(&one)?;
        assert_eq!(json, serde_json::json!("https://example.com/data_type"));

        let one2 = serde_json::from_value(json)?;
        assert_eq!(one, one2);

        Ok(())
    }

    #[test]
    fn value_or_array_array() -> Result<(), Box<dyn Error>> {
        let array = ValueOrArray::Array(TypedArray::new(
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
    fn optional_none() -> Result<(), Box<dyn Error>> {
        let none = Optional::<()>::None {};

        let json = serde_json::to_value(&none)?;
        assert_eq!(json, serde_json::json!({}));

        let empty2 = serde_json::from_value(json)?;
        assert_eq!(none, empty2);

        Ok(())
    }

    #[test]
    fn optional_value() -> Result<(), Box<dyn Error>> {
        let value = Optional::Value(Uri::new("https://example.com/data_type"));

        let json = serde_json::to_value(&value)?;
        assert_eq!(json, serde_json::json!("https://example.com/data_type"));

        let array2 = serde_json::from_value(json)?;
        assert_eq!(value, array2);

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
