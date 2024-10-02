use core::str::FromStr;
use std::{collections::HashSet, sync::LazyLock};

use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::{
    Valid, Validator,
    schema::{ClosedDataType, DataType, DataTypeReference},
    url::VersionedUrl,
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
    #[error("A data type requires a parent specified in `allOf`")]
    MissingParent,
    #[error("Only primitive data types can inherit from the value data type")]
    NonPrimitiveValueInheritance,
}

pub struct DataTypeValidator;

static VALUE_DATA_TYPE_ID: LazyLock<DataTypeReference> = LazyLock::new(|| DataTypeReference {
    url: VersionedUrl::from_str(
        "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
    )
    .expect("Invalid URL"),
});

static PRIMITIVE_DATA_TYPE_IDS: LazyLock<HashSet<VersionedUrl>> = LazyLock::new(|| {
    HashSet::from([
        VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1")
            .expect("Invalid URL"),
        VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
        )
        .expect("Invalid URL"),
        VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        )
        .expect("Invalid URL"),
        VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1")
            .expect("Invalid URL"),
        VersionedUrl::from_str("https://blockprotocol.org/@blockprotocol/types/data-type/list/v/1")
            .expect("Invalid URL"),
        VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        )
        .expect("Invalid URL"),
    ])
});

impl Validator<DataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;

    async fn validate_ref<'v>(
        &self,
        value: &'v DataType,
    ) -> Result<&'v Valid<DataType>, Self::Error> {
        if value.all_of.is_empty() && value.id != VALUE_DATA_TYPE_ID.url {
            return Err(ValidateDataTypeError::MissingParent);
        } else if value.all_of.contains(&*VALUE_DATA_TYPE_ID)
            && !PRIMITIVE_DATA_TYPE_IDS.contains(&value.id)
        {
            return Err(ValidateDataTypeError::NonPrimitiveValueInheritance);
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
