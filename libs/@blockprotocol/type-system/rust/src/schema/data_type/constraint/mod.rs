mod array;
mod boolean;
mod error;
mod null;
mod number;
mod object;
mod string;

use error_stack::{Report, ResultExt, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

pub(crate) use self::{
    array::ArraySchema, boolean::BooleanSchema, error::ConstraintError, null::NullSchema,
    number::NumberSchema, object::ObjectSchema, string::StringSchema,
};
use crate::schema::JsonSchemaValueType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ValueConstraints {
    Null(NullSchema),
    Boolean(BooleanSchema),
    Number(NumberSchema),
    String(StringSchema),
    Array(ArraySchema),
    Object(ObjectSchema),
}

impl ValueConstraints {
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
        }
    }
}
