use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};

use crate::{
    Value,
    schema::{
        ConstraintError, ConstraintValidator, JsonSchemaValueType,
        data_type::{closed::ResolveClosedDataTypeError, constraint::Constraint},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NullTypeTag {
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NullSchema;

impl Constraint for NullSchema {
    fn intersection(
        self,
        _other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok((self, None))
    }
}

impl ConstraintValidator<Value> for NullSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &Value) -> bool {
        *value == Value::Null
    }

    fn validate_value(&self, value: &Value) -> Result<(), Report<ConstraintError>> {
        if self.is_valid(value) {
            Ok(())
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Null,
            });
        }
    }
}
