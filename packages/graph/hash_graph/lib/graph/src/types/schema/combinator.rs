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
    use serde_json::json;

    use super::*;
    use crate::types::schema::tests::{check, check_invalid_json};

    mod optional {
        use super::*;

        #[test]
        fn none() -> Result<(), serde_json::Error> {
            check(&Optional::<()>::None {}, json!({}))
        }

        #[test]
        fn some() -> Result<(), serde_json::Error> {
            check(&Optional::Some("value".to_owned()), json!("value"))
        }
    }

    mod value_or_array {
        use super::*;

        #[test]
        fn value() -> Result<(), serde_json::Error> {
            check(&ValueOrArray::Value("value".to_owned()), json!("value"))
        }

        #[test]
        fn array() -> Result<(), serde_json::Error> {
            check(
                &ValueOrArray::Array(TypedArray::new("string".to_owned(), None, None)),
                json!({
                    "type": "array",
                    "items": "string",
                }),
            )
        }
    }

    mod one_of {
        use std::error::Error;

        use super::*;

        #[test]
        fn empty() {
            check_invalid_json::<OneOf<()>>(json!({
                "oneOf": []
            }));
        }

        #[test]
        fn one() -> Result<(), Box<dyn Error>> {
            check(
                &OneOf::new(["A".to_owned()])?,
                json!({
                    "oneOf": ["A"]
                }),
            )?;
            Ok(())
        }

        #[test]
        fn multiple() -> Result<(), Box<dyn Error>> {
            check(
                &OneOf::new(["A".to_owned(), "B".to_owned()])?,
                json!({
                    "oneOf": ["A", "B"]
                }),
            )?;
            Ok(())
        }

        #[test]
        fn additional_properties() {
            check_invalid_json::<OneOf<()>>(json!({
                "oneOf": ["A", "B"],
                "additional": 10,
            }));
        }
    }
}
