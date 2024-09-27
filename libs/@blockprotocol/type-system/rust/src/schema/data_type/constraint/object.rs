use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{ConstraintError, JsonSchemaValueType};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum ObjectTypeTag {
    Object,
}

pub(crate) fn validate_object_value(value: &JsonValue) -> Result<(), Report<ConstraintError>> {
    if value.is_object() {
        Ok(())
    } else {
        bail!(ConstraintError::InvalidType {
            actual: JsonSchemaValueType::from(value),
            expected: JsonSchemaValueType::Object,
        });
    }
}
