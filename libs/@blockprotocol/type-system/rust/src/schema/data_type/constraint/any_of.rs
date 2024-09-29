use error_stack::{Report, ReportSink, ResultExt};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{ConstraintError, SingleValueSchema};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnyOfConstraints {
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[SingleValueSchema, ...SingleValueSchema[]]")
    )]
    pub any_of: Vec<SingleValueSchema>,
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
            if status
                .attempt(schema.constraints.validate_value(value))
                .is_some()
            {
                return Ok(());
            }
        }
        status.finish().change_context(ConstraintError::AnyOf)
    }
}
