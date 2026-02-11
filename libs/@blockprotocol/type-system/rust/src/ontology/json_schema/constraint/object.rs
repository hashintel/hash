use std::collections::HashMap;

use error_stack::{Report, ResultExt as _, bail};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::{Constraint, ConstraintError, ConstraintValidator, JsonSchemaValueType};
use crate::{knowledge::PropertyValue, ontology::data_type::schema::ResolveClosedDataTypeError};

#[derive(Debug, Error)]
pub enum ObjectValidationError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum ObjectTypeTag {
    Object,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged, rename_all = "camelCase", deny_unknown_fields)]
pub enum ObjectSchema {
    Constrained(ObjectConstraints),
}

impl Constraint for ObjectSchema {
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Constrained(lhs), Self::Constrained(rhs)) => {
                let (combined, remainder) = lhs.intersection(rhs)?;
                (
                    Self::Constrained(combined),
                    remainder.map(Self::Constrained),
                )
            }
        })
    }
}

impl ConstraintValidator<PropertyValue> for ObjectSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &PropertyValue) -> bool {
        if let PropertyValue::Object(object) = value {
            self.is_valid(object)
        } else {
            false
        }
    }

    fn validate_value(&self, value: &PropertyValue) -> Result<(), Report<ConstraintError>> {
        if let PropertyValue::Object(object) = value {
            self.validate_value(object)
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Object,
            });
        }
    }
}

impl ConstraintValidator<HashMap<String, PropertyValue>> for ObjectSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &HashMap<String, PropertyValue>) -> bool {
        match self {
            Self::Constrained(constraints) => constraints.is_valid(value),
        }
    }

    fn validate_value(
        &self,
        value: &HashMap<String, PropertyValue>,
    ) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(value)
                .change_context(ConstraintError::ValueConstraint)?,
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObjectConstraints;

impl Constraint for ObjectConstraints {
    fn intersection(
        self,
        _other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok((self, None))
    }
}

impl ConstraintValidator<HashMap<String, PropertyValue>> for ObjectConstraints {
    type Error = [ObjectValidationError];

    fn is_valid(&self, _value: &HashMap<String, PropertyValue>) -> bool {
        true
    }

    fn validate_value(
        &self,
        _value: &HashMap<String, PropertyValue>,
    ) -> Result<(), Report<[ObjectValidationError]>> {
        Ok(())
    }
}
