use serde_json::json;
use thiserror::Error;

use super::JsonSchemaValueType;
use crate::knowledge::PropertyValue;

#[derive(Debug, Error)]
pub enum ConstraintError {
    #[error(
        "the provided value is not equal to the expected value, expected `{actual}` to be equal \
         to `{expected}`"
    )]
    InvalidConstValue {
        actual: PropertyValue,
        expected: PropertyValue,
    },
    #[error("the provided value is not one of the expected values, expected `{actual}` to be one of `{}`", json!(expected))]
    InvalidEnumValue {
        actual: PropertyValue,
        expected: Vec<PropertyValue>,
    },
    #[error("the value does not match the expected constraints")]
    ValueConstraint,
    #[error(
        "the value provided does not match the expected type, expected `{expected}`, got \
         `{actual}`"
    )]
    InvalidType {
        actual: JsonSchemaValueType,
        expected: JsonSchemaValueType,
    },
    #[error("None of the provided values match the expected values")]
    AnyOf,
}
