use thiserror::Error;

use crate::{schema::one_of::OneOfSchema, Valid, Validator};

#[derive(Debug, Error)]
pub enum OneOfSchemaValidationError {
    #[error("`oneOf` schema requires at least one element")]
    Empty,
}

pub struct OneOfSchemaValidator;

impl<T: Sync> Validator<Vec<T>> for OneOfSchemaValidator {
    type Error = OneOfSchemaValidationError;

    async fn validate_ref<'v>(&self, value: &'v Vec<T>) -> Result<&'v Valid<Vec<T>>, Self::Error> {
        if value.is_empty() {
            return Err(OneOfSchemaValidationError::Empty);
        }
        Ok(Valid::new_ref_unchecked(value))
    }
}

impl<T: Sync> Validator<OneOfSchema<T>> for OneOfSchemaValidator {
    type Error = OneOfSchemaValidationError;

    async fn validate_ref<'v>(
        &self,
        value: &'v OneOfSchema<T>,
    ) -> Result<&'v Valid<OneOfSchema<T>>, Self::Error> {
        self.validate_ref(&value.possibilities).await?;
        Ok(Valid::new_ref_unchecked(value))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::utils::tests::{ensure_failed_validation, ensure_validation, JsonEqualityCheck};

    #[tokio::test]
    async fn empty() {
        matches!(
            ensure_failed_validation::<Vec<i32>, OneOfSchemaValidator>(
                json!([]),
                OneOfSchemaValidator,
                JsonEqualityCheck::Yes
            )
            .await,
            OneOfSchemaValidationError::Empty,
        );
    }

    #[tokio::test]
    async fn non_empty() {
        assert_eq!(
            *ensure_validation::<Vec<i32>, OneOfSchemaValidator>(
                json!([1, 2, 3]),
                OneOfSchemaValidator,
                JsonEqualityCheck::Yes
            )
            .await,
            vec![1, 2, 3]
        );
    }
}
