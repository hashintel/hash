use crate::{
    Valid, Validator,
    schema::{
        ClosedEntityType, EntityType, ObjectSchemaValidationError, ObjectSchemaValidator,
        PropertyTypeReference, ValueOrArray,
    },
    url::BaseUrl,
};

#[derive(Debug, derive_more::Display, derive_more::Error, derive_more::From)]
pub enum EntityTypeValidationError {
    #[display("The property reference {} does not match the base URL {base_url}", reference.url)]
    InvalidPropertyReference {
        base_url: BaseUrl,
        reference: PropertyTypeReference,
    },
    #[display("Property object validation failed: {_0}")]
    #[from]
    ObjectValidationFailed(ObjectSchemaValidationError),
}

#[derive(Debug)]
pub struct EntityTypeValidator;

impl Validator<EntityType> for EntityTypeValidator {
    type Error = EntityTypeValidationError;

    fn validate_ref<'v>(
        &self,
        value: &'v EntityType,
    ) -> Result<&'v Valid<EntityType>, Self::Error> {
        ObjectSchemaValidator.validate_ref(value)?;

        for (property, value) in &value.constraints.properties {
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

    fn validate_ref<'v>(
        &self,
        value: &'v ClosedEntityType,
    ) -> Result<&'v Valid<ClosedEntityType>, Self::Error> {
        ObjectSchemaValidator.validate_ref(value)?;

        for (property, value) in &value.constraints.properties {
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
