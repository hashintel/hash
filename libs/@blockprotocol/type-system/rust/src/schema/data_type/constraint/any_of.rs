use error_stack::{Report, ReportSink, ResultExt};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{ConstraintError, ValueLabel, data_type::constraint::SimpleTypedValueSchema};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnyOfConstraints {
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[SimpleTypedValueSchema, ...SimpleTypedValueSchema[]]")
    )]
    pub any_of: Vec<SimpleTypedValueSchema>,
}

impl AnyOfConstraints {
    /// Checks if the provided value is valid against any of the schemas in the `any_of` list.
    ///
    /// # Errors
    ///
    /// - [`AnyOf`] if the value is not valid against any of the schemas.
    ///
    /// [`AnyOf`]: ConstraintError::AnyOf
    pub fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        let mut status = ReportSink::<ConstraintError>::new();
        for schema in &self.any_of {
            if let Err(error) = schema.constraints.validate_value(value) {
                status.capture(error);
            } else {
                return Ok(());
            }
        }
        status.finish().change_context(ConstraintError::AnyOf)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnyOfSchema {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,
    #[serde(flatten)]
    pub constraints: AnyOfConstraints,
}
