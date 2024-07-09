use thiserror::Error;

use crate::{
    schema::{ObjectSchemaValidationError, ObjectSchemaValidator, ValueOrArray},
    url::BaseUrl,
    ClosedEntityType, EntityType, PropertyTypeReference, Valid, Validator,
};

#[derive(Debug, Error)]
pub enum EntityTypeValidationError {
    #[error("The property reference {} does not match the base URL {base_url}", reference.url)]
    InvalidPropertyReference {
        base_url: BaseUrl,
        reference: PropertyTypeReference,
    },
    #[error("Property object validation failed: {0}")]
    ObjectValidationFailed(#[from] ObjectSchemaValidationError),
}

pub struct EntityTypeValidator;

impl Validator<EntityType> for EntityTypeValidator {
    type Error = EntityTypeValidationError;
    type Validated = EntityType;

    async fn validate_ref<'v>(
        &self,
        value: &'v EntityType,
    ) -> Result<&'v Valid<Self::Validated>, Self::Error> {
        ObjectSchemaValidator.validate_ref(value).await?;

        for (property, value) in &value.properties {
            let reference = match value {
                ValueOrArray::Value(value) => value,
                ValueOrArray::Array(array) => &array.items,
            };
            if *property != reference.url.base_url {
                return Err(EntityTypeValidationError::InvalidPropertyReference {
                    base_url: property.clone(),
                    reference: reference.clone(),
                });
            }
            // TODO: Validate reference
            //   see https://linear.app/hash/issue/H-3046
        }

        Ok(Valid::new_ref_unchecked(value))
    }
}

impl Validator<ClosedEntityType> for EntityTypeValidator {
    type Error = EntityTypeValidationError;
    type Validated = ClosedEntityType;

    async fn validate_ref<'v>(
        &self,
        value: &'v ClosedEntityType,
    ) -> Result<&'v Valid<Self::Validated>, Self::Error> {
        ObjectSchemaValidator.validate_ref(value).await?;

        for (property, value) in &value.properties {
            let reference = match value {
                ValueOrArray::Value(value) => value,
                ValueOrArray::Array(array) => &array.items,
            };
            if *property != reference.url.base_url {
                return Err(EntityTypeValidationError::InvalidPropertyReference {
                    base_url: property.clone(),
                    reference: reference.clone(),
                });
            }
            // TODO: Validate reference
            //   see https://linear.app/hash/issue/H-3046
        }

        Ok(Valid::new_ref_unchecked(value))
    }
}
