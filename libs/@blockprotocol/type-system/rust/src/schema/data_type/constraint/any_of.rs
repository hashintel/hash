use error_stack::{Report, ReportSink, ResultExt};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{ConstraintError, SingleValueSchema, data_type::constraint::Constraint};

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

impl Constraint<JsonValue> for AnyOfConstraints {
    type Error = ConstraintError;

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        let mut status = ReportSink::<ConstraintError>::new();
        for schema in &self.any_of {
            if status
                .attempt(schema.constraints.validate_value(value))
                .is_some()
            {
                // We found a valid schema, so we can return early.
                let _: Result<(), _> = status.finish();
                return Ok(());
            }
        }
        status.finish().change_context(ConstraintError::AnyOf)
    }
}
