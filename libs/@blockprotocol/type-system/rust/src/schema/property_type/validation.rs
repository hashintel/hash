use thiserror::Error;

use crate::{
    schema::{
        ObjectSchemaValidationError, ObjectSchemaValidator, OneOfSchemaValidationError,
        OneOfSchemaValidator, PropertyType, PropertyTypeReference, PropertyValues, ValueOrArray,
    },
    url::BaseUrl,
    Valid, Validator,
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

pub struct PropertyTypeValidator;

impl Validator<PropertyType> for PropertyTypeValidator {
    type Error = PropertyTypeValidationError;
    type Validated = PropertyType;

    async fn validate_ref<'v>(
        &self,
        value: &'v PropertyType,
    ) -> Result<&'v Valid<Self::Validated>, Self::Error> {
        OneOfSchemaValidator.validate_ref(&value.one_of).await?;
        for element in &value.one_of {
            self.validate_ref(element).await?;
        }
        Ok(Valid::new_ref_unchecked(value))
    }
}

impl Validator<PropertyValues> for PropertyTypeValidator {
    type Error = PropertyTypeValidationError;
    type Validated = PropertyValues;

    #[expect(
        clippy::manual_async_fn,
        reason = "Results in a cyclic dependency [E0391]"
    )]
    fn validate_ref<'v>(
        &self,
        value: &'v PropertyValues,
    ) -> impl Future<Output = Result<&'v Valid<Self::Validated>, Self::Error>> + Send {
        async move {
            match value {
                PropertyValues::DataTypeReference(_) => {
                    // TODO: Validate reference
                    //   see https://linear.app/hash/issue/H-3046
                }
                PropertyValues::PropertyTypeObject(object) => {
                    ObjectSchemaValidator.validate_ref(object).await?;
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
                    // Instead of boxing every call to `validate_ref` we pin the whole async block
                    Box::pin(async move {
                        for property_values in &array.items.possibilities {
                            self.validate_ref(property_values).await?;
                        }
                        Ok::<_, Self::Error>(())
                    })
                    .await?;
                }
            }
            Ok(Valid::new_ref_unchecked(value))
        }
    }
}
