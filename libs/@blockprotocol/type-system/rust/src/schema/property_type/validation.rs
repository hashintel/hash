use thiserror::Error;

use crate::{
    Valid, Validator,
    schema::{
        ObjectSchemaValidationError, ObjectSchemaValidator, OneOfSchemaValidationError,
        OneOfSchemaValidator, PropertyType, PropertyTypeReference, PropertyValues, ValueOrArray,
    },
    url::BaseUrl,
};

#[derive(Debug, Error)]
pub enum PropertyTypeValidationError {
    #[error("The property reference {} does not match the base URL {base_url}", reference.url)]
    InvalidPropertyReference {
        base_url: BaseUrl,
        reference: PropertyTypeReference,
    },
    #[error("Property object validation failed: {0}")]
    ObjectValidationFailed(#[from] ObjectSchemaValidationError),
    #[error("OneOf validation failed: {0}")]
    OneOfValidationFailed(#[from] OneOfSchemaValidationError),
}

#[derive(Debug)]
pub struct PropertyTypeValidator;

impl Validator<PropertyType> for PropertyTypeValidator {
    type Error = PropertyTypeValidationError;

    fn validate_ref<'v>(
        &self,
        value: &'v PropertyType,
    ) -> Result<&'v Valid<PropertyType>, Self::Error> {
        OneOfSchemaValidator.validate_ref(&value.one_of)?;
        for element in &value.one_of {
            self.validate_ref(element)?;
        }
        Ok(Valid::new_ref_unchecked(value))
    }
}

impl Validator<PropertyValues> for PropertyTypeValidator {
    type Error = PropertyTypeValidationError;

    fn validate_ref<'v>(
        &self,
        value: &'v PropertyValues,
    ) -> Result<&'v Valid<PropertyValues>, Self::Error> {
        match value {
            PropertyValues::DataTypeReference(_) => {
                // TODO: Validate reference
                //   see https://linear.app/hash/issue/H-3046
            }
            PropertyValues::PropertyTypeObject(object) => {
                ObjectSchemaValidator.validate_ref(object)?;
                for (property, value) in &object.properties {
                    let reference = match value {
                        ValueOrArray::Value(value) => value,
                        ValueOrArray::Array(array) => &array.items,
                    };
                    if *property != reference.url.base_url {
                        return Err(PropertyTypeValidationError::InvalidPropertyReference {
                            base_url: property.clone(),
                            reference: reference.clone(),
                        });
                    }
                    // TODO: Validate reference
                    //   see https://linear.app/hash/issue/H-3046
                }
            }
            PropertyValues::ArrayOfPropertyValues(array) => {
                for property_values in &array.items.possibilities {
                    self.validate_ref(property_values)?;
                }
            }
        }
        Ok(Valid::new_ref_unchecked(value))
    }
}
