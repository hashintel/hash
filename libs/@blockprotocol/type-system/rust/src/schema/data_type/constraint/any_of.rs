use error_stack::{Report, ReportSink, ResultExt};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{
    ConstraintError, SingleValueSchema,
    data_type::{
        closed::ResolveClosedDataTypeError,
        constraint::{Constraint, ConstraintValidator},
    },
};

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

impl Constraint for AnyOfConstraints {
    fn combine(&mut self, other: Self) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>> {
        // TODO: Implement folding for anyOf constraints
        //   see https://linear.app/hash/issue/H-3430/implement-folding-for-anyof-constraints
        Ok(Some(other))
    }
}

impl ConstraintValidator<JsonValue> for AnyOfConstraints {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        self.any_of
            .iter()
            .any(|schema| schema.constraints.is_valid(value))
    }

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
