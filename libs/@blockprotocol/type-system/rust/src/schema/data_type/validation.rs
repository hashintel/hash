use thiserror::Error;

use crate::{schema::DataType, Valid, Validator};

#[derive(Debug, Error)]
pub enum ValidateDataTypeError {}

pub struct DataTypeValidator;

impl Validator<DataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;
    type Validated = DataType;

    async fn validate_ref<'v>(
        &self,
        value: &'v DataType,
    ) -> Result<&'v Valid<Self::Validated>, Self::Error> {
        Ok(Valid::new_ref_unchecked(value))
    }
}
