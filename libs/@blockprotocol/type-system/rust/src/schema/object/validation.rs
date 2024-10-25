use std::collections::{HashMap, HashSet};

use thiserror::Error;

use crate::{
    Valid, Validator,
    schema::{ClosedEntityType, EntityType, object::PropertyValueObject},
    url::BaseUrl,
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

impl<T: Sync> Validator<PropertyValueObject<T>> for ObjectSchemaValidator {
    type Error = ObjectSchemaValidationError;

    async fn validate_ref<'v>(
        &self,
        value: &'v PropertyValueObject<T>,
    ) -> Result<&'v Valid<PropertyValueObject<T>>, Self::Error> {
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

    async fn validate_ref<'v>(
        &self,
        value: &'v EntityType,
    ) -> Result<&'v Valid<EntityType>, Self::Error> {
        ObjectSchemaRef {
            properties: &value.constraints.properties,
            required: &value.constraints.required,
        }
        .validate()?;

        Ok(Valid::new_ref_unchecked(value))
    }
}

impl Validator<ClosedEntityType> for ObjectSchemaValidator {
    type Error = ObjectSchemaValidationError;

    async fn validate_ref<'v>(
        &self,
        value: &'v ClosedEntityType,
    ) -> Result<&'v Valid<ClosedEntityType>, Self::Error> {
        ObjectSchemaRef {
            properties: &value.constraints.properties,
            required: &value.constraints.required,
        }
        .validate()?;

        Ok(Valid::new_ref_unchecked(value))
    }
}
