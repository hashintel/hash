use error_stack::{Report, ResultExt, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;

type JsonObject = serde_json::Map<String, JsonValue>;

use crate::schema::{
    ConstraintError, ConstraintValidator, JsonSchemaValueType,
    data_type::{closed::ResolveClosedDataTypeError, constraint::Constraint},
};

#[derive(Debug, Error)]
pub enum ObjectValidationError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum ObjectTypeTag {
    Object,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase", deny_unknown_fields)]
pub enum ObjectSchema {
    Constrained(ObjectConstraints),
}

impl Constraint for ObjectSchema {
    fn combine(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Constrained(lhs), Self::Constrained(rhs)) => {
                let (combined, remainder) = lhs.combine(rhs)?;
                (
                    Self::Constrained(combined),
                    remainder.map(Self::Constrained),
                )
            }
        })
    }
}

impl ConstraintValidator<JsonValue> for ObjectSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        if let JsonValue::Object(object) = value {
            self.is_valid(object)
        } else {
            false
        }
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        if let JsonValue::Object(object) = value {
            self.validate_value(object)
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Object,
            });
        }
    }
}

impl ConstraintValidator<JsonObject> for ObjectSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonObject) -> bool {
        match self {
            Self::Constrained(constraints) => constraints.is_valid(value),
        }
    }

    fn validate_value(&self, value: &JsonObject) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(value)
                .change_context(ConstraintError::ValueConstraint)?,
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(
    clippy::empty_structs_with_brackets,
    reason = "This struct is a placeholder for future functionality."
)]
pub struct ObjectConstraints {}

impl Constraint for ObjectConstraints {
    fn combine(
        self,
        _other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok((self, None))
    }
}

impl ConstraintValidator<JsonObject> for ObjectConstraints {
    type Error = [ObjectValidationError];

    fn is_valid(&self, _value: &JsonObject) -> bool {
        true
    }

    fn validate_value(&self, _value: &JsonObject) -> Result<(), Report<[ObjectValidationError]>> {
        Ok(())
    }
}
