use thiserror::Error;

use crate::schema::JsonSchemaValueType;

#[derive(Debug, Error)]
pub enum ConstraintError {
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
