use thiserror::Error;

use super::PropertyValueArray;
use crate::{Valid, Validator};

#[derive(Debug, Error)]
pub enum ArraySchemaValidationError {
    #[error(
        "Unsatisfiable item number constraints, expected minimum amount of items ({min}) to be \
         less than or equal to the maximum amount of items ({max})"
    )]
    IncompatibleItemNumberConstraints { min: usize, max: usize },
}

pub struct ArraySchemaValidator;

impl<T: Sync> Validator<PropertyValueArray<T>> for ArraySchemaValidator {
    type Error = ArraySchemaValidationError;

    fn validate_ref<'v>(
        &self,
        value: &'v PropertyValueArray<T>,
    ) -> Result<&'v Valid<PropertyValueArray<T>>, Self::Error> {
        if let Some((min, max)) = value.min_items.zip(value.max_items)
            && min > max
        {
            return Err(ArraySchemaValidationError::IncompatibleItemNumberConstraints { min, max });
        }

        Ok(Valid::new_ref_unchecked(value))
    }
}
