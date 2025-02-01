use serde_json::json;
use thiserror::Error;

use crate::{Value, schema::JsonSchemaValueType};

#[derive(Debug, Error)]
pub enum ConstraintError {
    #[error(
        "the provided value is not equal to the expected value, expected `{actual}` to be equal \
         to `{expected}`"
    )]
    InvalidConstValue { actual: Value, expected: Value },
    #[error("the provided value is not one of the expected values, expected `{actual}` to be one of `{}`", json!(expected))]
    InvalidEnumValue { actual: Value, expected: Vec<Value> },
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
