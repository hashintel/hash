use thiserror::Error;

use crate::{Valid, Validator, schema::PropertyValueArray};

#[derive(Debug, Error)]
pub enum ArraySchemaValidationError {
    #[error(
        "Unsatisfiable item number constraints, expected minimum of {min} and maximum of {max} \
         items"
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
        if let Some((min, max)) = value.min_items.zip(value.max_items) {
            return Err(ArraySchemaValidationError::IncompatibleItemNumberConstraints { min, max });
        }

        Ok(Valid::new_ref_unchecked(value))
    }
}
