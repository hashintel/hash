mod array;
mod boolean;
mod error;
mod null;
mod number;
mod object;
mod string;

use error_stack::{Report, ResultExt, TryReportIteratorExt, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

pub use self::{
    array::{ArraySchema, ArrayTypeTag, ArrayValidationError},
    boolean::{BooleanSchema, BooleanTypeTag, BooleanValidationError},
    error::ConstraintError,
    null::{NullSchema, NullTypeTag},
    number::{NumberSchema, NumberTypeTag, NumberValidationError},
    object::{ObjectSchema, ObjectTypeTag, ObjectValidationError},
    string::{StringFormat, StringFormatError, StringSchema, StringTypeTag, StringValidationError},
};
use crate::schema::{DataTypeLabel, JsonSchemaValueType};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnyOfConstraint {
    pub any_of: Vec<ValueConstraints>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "DataTypeLabel::is_empty")]
    pub label: DataTypeLabel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase")]
pub enum ValueConstraints {
    Null(NullSchema),
    Boolean(BooleanSchema),
    Number(NumberSchema),
    String(StringSchema),
    Array(ArraySchema),
    Object(ObjectSchema),
    AnyOf(AnyOfConstraint),
}

impl ValueConstraints {
    /// Validates the provided value against the constraints.
    ///
    /// # Errors
    ///
    /// - [`InvalidType`] if the value does not match the expected type.
    /// - [`ValueConstraint`] if the value does not match the expected constraints.
    /// - [`AnyOf`] if the value does not match any of the expected schemas.
    ///
    /// [`InvalidType`]: ConstraintError::InvalidType
    /// [`ValueConstraint`]: ConstraintError::ValueConstraint
    /// [`AnyOf`]: ConstraintError::AnyOf
    pub fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Null(_) => {
                if value.is_null() {
                    Ok(())
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Null,
                    })
                }
            }
            Self::Boolean(schema) => {
                if let JsonValue::Bool(boolean) = value {
                    schema
                        .validate_value(*boolean)
                        .change_context(ConstraintError::ValueConstraint)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Boolean,
                    })
                }
            }
            Self::Number(schema) => {
                if let JsonValue::Number(number) = value {
                    schema
                        .validate_value(number)
                        .change_context(ConstraintError::ValueConstraint)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Number,
                    })
                }
            }
            Self::String(schema) => {
                if let JsonValue::String(string) = value {
                    schema
                        .validate_value(string)
                        .change_context(ConstraintError::ValueConstraint)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::String,
                    })
                }
            }
            Self::Array(schema) => {
                if let JsonValue::Array(array) = value {
                    schema
                        .validate_value(array)
                        .change_context(ConstraintError::ValueConstraint)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Array,
                    })
                }
            }
            Self::Object(schema) => {
                if let JsonValue::Object(object) = value {
                    schema
                        .validate_value(object)
                        .change_context(ConstraintError::ValueConstraint)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Object,
                    })
                }
            }
            Self::AnyOf(AnyOfConstraint { any_of, .. }) => {
                let mut num_successes = 0;
                let status = any_of
                    .iter()
                    .map(|schema| schema.validate_value(value).map(|()| num_successes += 1))
                    .try_collect_reports();
                if num_successes == 0 {
                    status.change_context(ConstraintError::AnyOf)
                } else {
                    Ok(())
                }
            }
        }
    }
}
