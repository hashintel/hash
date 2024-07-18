use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::{
    schema::{ClosedDataType, DataType},
    Valid, Validator,
};

#[derive(Debug, Error)]
pub enum ValidateDataTypeError {
    #[error("Enum values are not compatible with `const` value")]
    EnumValuesNotCompatibleWithConst {
        const_value: JsonValue,
        enum_values: Vec<JsonValue>,
    },
}

pub struct DataTypeValidator;

impl Validator<DataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;
    type Validated = DataType;

    async fn validate_ref<'v>(
        &self,
        value: &'v DataType,
    ) -> Result<&'v Valid<Self::Validated>, Self::Error> {
        if let Some(const_value) = &value.const_value {
            if !value.enum_values.is_empty()
                && (value.enum_values.len() > 1 || value.enum_values[0] != *const_value)
            {
                return Err(ValidateDataTypeError::EnumValuesNotCompatibleWithConst {
                    const_value: const_value.clone(),
                    enum_values: value.enum_values.clone(),
                });
            }
        }

        // TODO: Implement validation for data types
        //   see https://linear.app/hash/issue/H-2976/validate-ontology-types-on-creation
        Ok(Valid::new_ref_unchecked(value))
    }
}

impl Validator<ClosedDataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;
    type Validated = ClosedDataType;

    async fn validate_ref<'v>(
        &self,
        value: &'v ClosedDataType,
    ) -> Result<&'v Valid<Self::Validated>, Self::Error> {
        // TODO: Implement validation for data types
        //   see https://linear.app/hash/issue/H-2976/validate-ontology-types-on-creation
        Ok(Valid::new_ref_unchecked(value))
    }
}
