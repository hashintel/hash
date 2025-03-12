use error_stack::{Report, bail};
use serde::{Deserialize, Serialize};

use super::{Constraint, ConstraintError, ConstraintValidator, JsonSchemaValueType};
use crate::{knowledge::Value, ontology::data_type::schema::ResolveClosedDataTypeError};

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

impl ConstraintValidator<Value> for BooleanSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &Value) -> bool {
        matches!(value, Value::Bool(_))
    }

    fn validate_value(&self, value: &Value) -> Result<(), Report<ConstraintError>> {
        if self.is_valid(value) {
            Ok(())
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Boolean,
            });
        }
    }
}
