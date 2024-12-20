use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{
    ConstraintError, ConstraintValidator, JsonSchemaValueType,
    data_type::{closed::ResolveClosedDataTypeError, constraint::Constraint},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BooleanTypeTag {
    Boolean,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BooleanSchema;

impl Constraint for BooleanSchema {
    fn intersection(
        self,
        _other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok((self, None))
    }
}

impl ConstraintValidator<JsonValue> for BooleanSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        value.is_boolean()
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        if value.is_boolean() {
            Ok(())
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Boolean,
            });
        }
    }
}
