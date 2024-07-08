use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::{
    schema::{DataType, JsonSchemaValueType},
    Valid, Validator,
};

#[derive(Debug, Error)]
pub enum ValidateDataTypeError {
    #[error("Unexpected additional property `{0}`")]
    UnexpectedAdditionalProperty(String),
    #[error(
        "Unexpected additional property type for `{property}`, expected `{expected}`, got \
         `{actual}"
    )]
    UnexpectedAdditionalPropertyType {
        property: String,
        actual: JsonSchemaValueType,
        expected: JsonSchemaValueType,
    },
}

pub struct DataTypeValidator;

impl Validator<DataType> for DataTypeValidator {
    type Error = ValidateDataTypeError;
    type Validated = DataType;

    async fn validate_ref<'v>(
        &self,
        value: &'v DataType,
    ) -> Result<&'v Valid<Self::Validated>, Self::Error> {
        for (additional_property, property_value) in &value.additional_properties {
            match additional_property.as_str() {
                "const" | "enum" => {}
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                | "minLength" | "maxLength" => {
                    if !matches!(property_value, JsonValue::Number(_)) {
                        return Err(ValidateDataTypeError::UnexpectedAdditionalPropertyType {
                            property: additional_property.clone(),
                            actual: JsonSchemaValueType::from(property_value),
                            expected: JsonSchemaValueType::Number,
                        });
                    }
                }
                "format" | "pattern" => {
                    if !matches!(property_value, JsonValue::String(_)) {
                        return Err(ValidateDataTypeError::UnexpectedAdditionalPropertyType {
                            property: additional_property.clone(),
                            actual: JsonSchemaValueType::from(property_value),
                            expected: JsonSchemaValueType::String,
                        });
                    }
                }
                "label" => {
                    if !matches!(property_value, JsonValue::Object(_)) {
                        return Err(ValidateDataTypeError::UnexpectedAdditionalPropertyType {
                            property: additional_property.clone(),
                            actual: JsonSchemaValueType::from(property_value),
                            expected: JsonSchemaValueType::Object,
                        });
                    }
                }
                _ => {
                    return Err(ValidateDataTypeError::UnexpectedAdditionalProperty(
                        additional_property.clone(),
                    ));
                }
            }
        }

        Ok(Valid::new_ref_unchecked(value))
    }
}
