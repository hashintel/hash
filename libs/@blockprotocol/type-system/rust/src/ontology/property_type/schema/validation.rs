use super::{
    ArraySchemaValidationError, ArraySchemaValidator, ObjectSchemaValidationError,
    ObjectSchemaValidator, PropertyType, PropertyTypeReference, PropertyValues, ValueOrArray,
};
use crate::{
    Valid, Validator,
    ontology::{
        BaseUrl,
        json_schema::{OneOfSchemaValidationError, OneOfSchemaValidator},
    },
};

#[derive(Debug, derive_more::Display, derive_more::Error, derive_more::From)]
pub enum PropertyTypeValidationError {
    #[display("The property reference {} does not match the base URL {base_url}", reference.url)]
    InvalidPropertyReference {
        base_url: BaseUrl,
        reference: PropertyTypeReference,
    },
    #[display("Property object validation failed: {_0}")]
    #[from]
    ObjectValidationFailed(ObjectSchemaValidationError),
    #[display("Property array validation failed: {_0}")]
    #[from]
    ArrayValidationFailed(ArraySchemaValidationError),
    #[display("OneOf validation failed: {_0}")]
    #[from]
    OneOfValidationFailed(OneOfSchemaValidationError),
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
            PropertyValues::Value(_) => {}
            PropertyValues::Object(object) => {
                ObjectSchemaValidator.validate_ref(object)?;
                for (property, value) in &object.properties {
                    let reference = match value {
                        ValueOrArray::Value(value) => value,
                        ValueOrArray::Array(array) => {
                            ArraySchemaValidator.validate_ref(array)?;
                            &array.items
                        }
                    };
                    if *property != reference.url.base_url {
                        return Err(PropertyTypeValidationError::InvalidPropertyReference {
                            base_url: property.clone(),
                            reference: reference.clone(),
                        });
                    }
                }
            }
            PropertyValues::Array(array) => {
                for property_values in &array.items.possibilities {
                    self.validate_ref(property_values)?;
                }
            }
        }
        Ok(Valid::new_ref_unchecked(value))
    }
}
