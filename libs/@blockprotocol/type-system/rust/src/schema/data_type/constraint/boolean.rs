use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{ConstraintError, JsonSchemaValueType};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BooleanTypeTag {
    Boolean,
}

pub(crate) fn validate_boolean_value(value: &JsonValue) -> Result<(), Report<ConstraintError>> {
    if value.is_boolean() {
        Ok(())
    } else {
        bail!(ConstraintError::InvalidType {
            actual: JsonSchemaValueType::from(value),
            expected: JsonSchemaValueType::Boolean,
        })
    }
}
