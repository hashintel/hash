mod any_of;
mod array;
mod boolean;
mod error;
mod null;
mod number;
mod object;
mod string;

use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

pub use self::{
    any_of::{AnyOfConstraints, AnyOfSchema},
    array::{ArrayConstraints, ArraySchema, ArrayTypeTag, ArrayValidationError, TupleConstraints},
    boolean::BooleanTypeTag,
    error::ConstraintError,
    null::NullTypeTag,
    number::{NumberConstraints, NumberSchema, NumberTypeTag, NumberValidationError},
    object::ObjectTypeTag,
    string::{
        StringConstraints, StringFormat, StringFormatError, StringSchema, StringTypeTag,
        StringValidationError,
    },
};
use crate::schema::{JsonSchemaValueType, ValueLabel};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleTypedValueSchema {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,
    #[serde(flatten)]
    pub constraints: SimpleTypedValueConstraint,
}

#[cfg(target_arch = "wasm32")]
#[expect(
    dead_code,
    reason = "Used to export type to TypeScript to prevent Tsify generating interfaces"
)]
mod wasm {
    use super::*;

    #[derive(tsify::Tsify)]
    #[serde(untagged)]
    enum SimpleTypedValueSchema {
        Schema {
            #[serde(default, skip_serializing_if = "Option::is_none")]
            description: Option<String>,
            #[serde(default)]
            label: ValueLabel,
            #[serde(flatten)]
            constraints: SimpleTypedValueConstraint,
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase")]
pub enum SimpleValueSchema {
    Typed(SimpleTypedValueSchema),
    AnyOf(AnyOfSchema),
}

impl SimpleValueSchema {
    /// Forwards the value validation to the appropriate schema.
    ///
    /// # Errors
    ///
    /// - For [`Typed`] schemas, see [`TypedValueConstraints::validate_value`].
    /// - For [`AnyOf`] schemas, see [`AnyOfConstraints::validate_value`].
    ///
    /// [`Typed`]: Self::Typed
    /// [`AnyOf`]: Self::AnyOf
    pub fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Typed(schema) => schema.constraints.validate_value(value),
            Self::AnyOf(schema) => schema.constraints.validate_value(value),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SimpleTypedValueConstraint {
    Null,
    Boolean,
    Number(NumberSchema),
    String(StringSchema),
    Array,
    Object,
}

impl SimpleTypedValueConstraint {
    pub fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Null => {
                if value.is_null() {
                    Ok(())
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Null,
                    })
                }
            }
            Self::Boolean => {
                if value.is_boolean() {
                    Ok(())
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Boolean,
                    })
                }
            }
            Self::Number(schema) => {
                if let JsonValue::Number(number) = value {
                    schema.validate_value(number)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Number,
                    })
                }
            }
            Self::String(schema) => {
                if let JsonValue::String(string) = value {
                    schema.validate_value(string)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::String,
                    })
                }
            }
            Self::Array => {
                if value.is_array() {
                    Ok(())
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Array,
                    })
                }
            }
            Self::Object => {
                if value.is_object() {
                    Ok(())
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged, rename_all = "camelCase")]
pub enum ValueConstraints {
    Typed(TypedValueConstraints),
    AnyOf(AnyOfConstraints),
}

impl ValueConstraints {
    /// Forwards the value validation to the appropriate schema.
    ///
    /// # Errors
    ///
    /// - For [`Typed`] schemas, see [`TypedValueConstraints::validate_value`].
    /// - For [`AnyOf`] schemas, see [`SimpleTypedValueConstraint::validate_value`].
    ///
    /// [`Typed`]: Self::Typed
    /// [`AnyOf`]: Self::AnyOf
    pub fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Typed(constraints) => constraints.validate_value(value),
            Self::AnyOf(constraints) => constraints.validate_value(value),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TypedValueConstraints {
    Null,
    Boolean,
    Number(NumberSchema),
    String(StringSchema),
    Array(ArraySchema),
    Object,
}

impl TypedValueConstraints {
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
            Self::Null => {
                if value.is_null() {
                    Ok(())
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Null,
                    })
                }
            }
            Self::Boolean => {
                if value.is_boolean() {
                    Ok(())
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Boolean,
                    })
                }
            }
            Self::Number(schema) => {
                if let JsonValue::Number(number) = value {
                    schema.validate_value(number)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Number,
                    })
                }
            }
            Self::String(schema) => {
                if let JsonValue::String(string) = value {
                    schema.validate_value(string)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::String,
                    })
                }
            }
            Self::Array(schema) => {
                if let JsonValue::Array(array) = value {
                    schema.validate_value(array)
                } else {
                    bail!(ConstraintError::InvalidType {
                        actual: JsonSchemaValueType::from(value),
                        expected: JsonSchemaValueType::Array,
                    })
                }
            }
            Self::Object => {
                if value.is_object() {
                    Ok(())
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

#[cfg(test)]
mod tests {
    use core::fmt::Display;
    use std::collections::HashSet;

    use error_stack::Frame;
    use serde_json::Value as JsonValue;

    use crate::schema::data_type::constraint::ValueConstraints;

    pub(crate) fn read_schema(schema: &JsonValue) -> ValueConstraints {
        let parsed = serde_json::from_value(schema.clone()).expect("Failed to parse schema");
        assert_eq!(
            serde_json::to_value(&parsed).expect("Could not serialize schema"),
            *schema
        );
        parsed
    }

    pub(crate) fn check_constraints(schema: &ValueConstraints, value: &JsonValue) {
        schema
            .validate_value(value)
            .expect("Failed to validate value");
    }

    pub(crate) fn check_constraints_error<E: Display + Send + Sync + 'static>(
        schema: &ValueConstraints,
        value: &JsonValue,
        expected_errors: impl IntoIterator<Item = E>,
    ) {
        let err = schema
            .validate_value(value)
            .expect_err("Expected validation error");
        let errors = expected_errors
            .into_iter()
            .map(|error| error.to_string())
            .collect::<HashSet<_>>();
        let actual_errors = err
            .frames()
            .filter_map(Frame::downcast_ref::<E>)
            .map(ToString::to_string)
            .collect::<HashSet<_>>();

        assert_eq!(errors, actual_errors);
    }
}
