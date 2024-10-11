use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{
    ConstraintError, ConstraintValidator, JsonSchemaValueType,
    data_type::{closed::ResolveClosedDataTypeError, constraint::Constraint},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum NullTypeTag {
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NullSchema;

impl Constraint for NullSchema {
    fn combine(
        &mut self,
        _other: Self,
    ) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>> {
        Ok(None)
    }
}

impl ConstraintValidator<JsonValue> for NullSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        value.is_null()
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        if value.is_null() {
            Ok(())
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Null,
            });
        }
    }
}
