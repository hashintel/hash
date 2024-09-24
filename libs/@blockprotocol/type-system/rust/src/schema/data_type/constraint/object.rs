use error_stack::{Report, ReportSink};
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use thiserror::Error;

use crate::schema::DataTypeLabel;

#[derive(Debug, Error)]
pub enum ObjectValidationError {
    #[error(
        "the provided value is not equal to the expected value, expected `{}` to be equal \
         to `{}`", json!(actual), json!(expected)
    )]
    InvalidConstValue {
        actual: JsonMap<String, JsonValue>,
        expected: JsonMap<String, JsonValue>,
    },
    #[error("the provided value is not one of the expected values, expected `{}` to be one of `{}`", json!(actual), json!(expected))]
    InvalidEnumValue {
        actual: JsonMap<String, JsonValue>,
        expected: Vec<JsonMap<String, JsonValue>>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum ObjectTypeTag {
    Object,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObjectSchema {
    pub r#type: ObjectTypeTag,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "DataTypeLabel::is_empty")]
    pub label: DataTypeLabel,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Record<string, JsonValue>"))]
    pub r#const: Option<JsonMap<String, JsonValue>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[Record<string, JsonValue>, ...Record<string, JsonValue>[]]")
    )]
    pub r#enum: Vec<JsonMap<String, JsonValue>>,
}

impl ObjectSchema {
    /// Validates the provided value against the object constraints.
    ///
    /// # Errors
    ///
    /// - [`InvalidConstValue`] if the value is not equal to the expected value.
    /// - [`InvalidEnumValue`] if the value is not one of the expected values.
    ///
    /// [`InvalidConstValue`]: ObjectValidationError::InvalidConstValue
    /// [`InvalidEnumValue`]: ObjectValidationError::InvalidEnumValue
    pub fn validate_value(
        &self,
        object: &JsonMap<String, JsonValue>,
    ) -> Result<(), Report<[ObjectValidationError]>> {
        let mut validation_status = ReportSink::new();

        if let Some(expected) = &self.r#const {
            if expected != object {
                validation_status.capture(ObjectValidationError::InvalidConstValue {
                    expected: expected.clone(),
                    actual: object.clone(),
                });
            }
        }

        if !self.r#enum.is_empty() && !self.r#enum.iter().any(|expected| expected == object) {
            validation_status.capture(ObjectValidationError::InvalidEnumValue {
                expected: self.r#enum.clone(),
                actual: object.clone(),
            });
        }

        validation_status.finish()
    }
}
