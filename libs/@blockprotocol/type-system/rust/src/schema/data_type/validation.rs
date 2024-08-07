use std::collections::HashSet;

use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::{
    schema::{ClosedDataType, DataType},
    url::VersionedUrl,
    Valid, Validator,
};

#[derive(Debug, Error)]
pub enum ValidateDataTypeError {
    #[error("Enum values are not compatible with `const` value")]
    EnumValuesNotCompatibleWithConst {
        const_value: JsonValue,
        enum_values: Vec<JsonValue>,
    },
    #[error("Missing data type `{data_type_id}`")]
    MissingDataType { data_type_id: VersionedUrl },
    #[error("Cyclic data type reference detected for type `{data_type_id}`")]
    CyclicDataTypeReference { data_type_id: VersionedUrl },
}

pub struct DataTypeValidator;

impl Validator<DataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;

    async fn validate_ref<'v>(
        &self,
        value: &'v DataType,
    ) -> Result<&'v Valid<DataType>, Self::Error> {
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

    async fn validate_ref<'v>(
        &self,
        value: &'v ClosedDataType,
    ) -> Result<&'v Valid<ClosedDataType>, Self::Error> {
        let mut checked_types = HashSet::new();
        let mut types_to_check = value
            .schema
            .data_type_references()
            .map(|(reference, _)| reference)
            .collect::<Vec<_>>();
        while let Some(reference) = types_to_check.pop() {
            if !checked_types.insert(reference) || reference.url == value.schema.id {
                continue;
            }

            let data_type = value.definitions.get(&reference.url).ok_or_else(|| {
                ValidateDataTypeError::MissingDataType {
                    data_type_id: reference.url.clone(),
                }
            })?;
            types_to_check.extend(
                data_type
                    .data_type_references()
                    .map(|(reference, _)| reference),
            );
        }

        // TODO: Implement validation for data types
        //   see https://linear.app/hash/issue/H-2976/validate-ontology-types-on-creation
        Ok(Valid::new_ref_unchecked(value))
    }
}
