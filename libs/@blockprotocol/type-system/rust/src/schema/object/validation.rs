use std::collections::{HashMap, HashSet};

use thiserror::Error;

use crate::{
    schema::object::ObjectSchema, url::BaseUrl, ClosedEntityType, EntityType, Valid, Validator,
};

#[derive(Debug, Error)]
pub enum ObjectSchemaValidationError {
    #[error("invalid key inside `required`: `{0}`")]
    InvalidRequiredKey(BaseUrl),
}

pub struct ObjectSchemaValidator;

struct ObjectSchemaRef<'a, T> {
    pub properties: &'a HashMap<BaseUrl, T>,
    pub required: &'a HashSet<BaseUrl>,
}

impl<T> ObjectSchemaRef<'_, T> {
    fn validate(&self) -> Result<(), ObjectSchemaValidationError> {
        for required in self.required {
            if !self.properties.contains_key(required) {
                return Err(ObjectSchemaValidationError::InvalidRequiredKey(
                    required.clone(),
                ));
            }
        }

        Ok(())
    }
}

impl<T: Sync> Validator<ObjectSchema<T>> for ObjectSchemaValidator {
    type Error = ObjectSchemaValidationError;
    type Validated = ObjectSchema<T>;

    async fn validate_ref<'v>(
        &self,
        value: &'v ObjectSchema<T>,
    ) -> Result<&'v Valid<ObjectSchema<T>>, Self::Error> {
        ObjectSchemaRef {
            properties: &value.properties,
            required: &value.required,
        }
        .validate()?;

        Ok(Valid::new_ref_unchecked(value))
    }
}

impl Validator<EntityType> for ObjectSchemaValidator {
    type Error = ObjectSchemaValidationError;
    type Validated = EntityType;

    async fn validate_ref<'v>(
        &self,
        value: &'v EntityType,
    ) -> Result<&'v Valid<EntityType>, Self::Error> {
        ObjectSchemaRef {
            properties: &value.properties,
            required: &value.required,
        }
        .validate()?;

        Ok(Valid::new_ref_unchecked(value))
    }
}

impl Validator<ClosedEntityType> for ObjectSchemaValidator {
    type Error = ObjectSchemaValidationError;
    type Validated = ClosedEntityType;

    async fn validate_ref<'v>(
        &self,
        value: &'v ClosedEntityType,
    ) -> Result<&'v Valid<ClosedEntityType>, Self::Error> {
        ObjectSchemaRef {
            properties: &value.properties,
            required: &value.required,
        }
        .validate()?;

        Ok(Valid::new_ref_unchecked(value))
    }
}
