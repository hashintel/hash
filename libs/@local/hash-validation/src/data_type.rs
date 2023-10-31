use core::{borrow::Borrow, fmt};

use error_stack::{bail, ensure, Report, ResultExt};
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{url::VersionedUrl, DataType, DataTypeReference};

use crate::{
    error::{Actual, Expected},
    OntologyTypeProvider, Schema, Validate,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JsonSchemaValueType {
    Null,
    Boolean,
    Number,
    Integer,
    String,
    Array,
    Object,
}

impl fmt::Display for JsonSchemaValueType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Null => fmt.write_str("null"),
            Self::Boolean => fmt.write_str("boolean"),
            Self::Number => fmt.write_str("number"),
            Self::Integer => fmt.write_str("integer"),
            Self::String => fmt.write_str("string"),
            Self::Array => fmt.write_str("array"),
            Self::Object => fmt.write_str("object"),
        }
    }
}

impl From<&JsonValue> for JsonSchemaValueType {
    fn from(value: &JsonValue) -> Self {
        match value {
            JsonValue::Null => Self::Null,
            JsonValue::Bool(_) => Self::Boolean,
            JsonValue::Number(_) => Self::Number,
            JsonValue::String(_) => Self::String,
            JsonValue::Array(_) => Self::Array,
            JsonValue::Object(_) => Self::Object,
        }
    }
}

#[derive(Debug, Error)]
pub enum DataTypeConstraint {
    #[error("the provided value is not equal to the expected value")]
    Const {
        actual: JsonValue,
        expected: JsonValue,
    },
    #[error("unknown constraint: `{key}`")]
    Unknown { key: String },
}

#[derive(Debug, Error)]
pub enum DataValidationError {
    #[error("the validator was unable to read the data type: `{id}`")]
    DataTypeRetrieval { id: VersionedUrl },
    #[error(
        "the value provided does not match the data type, expected `{expected}`, got `{actual}`"
    )]
    InvalidType {
        actual: JsonSchemaValueType,
        expected: JsonSchemaValueType,
    },
    #[error("a constraint was not fulfilled")]
    ConstraintUnfulfilled,
    #[error("the schema contains an unknown data type: `{schema}`")]
    UnknownType { schema: String },
}

impl<P: Sync> Schema<JsonValue, P> for DataType {
    type Error = DataValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a JsonValue,
        _provider: &'a P,
    ) -> Result<(), Report<DataValidationError>> {
        match self.json_type() {
            "null" => ensure!(
                value.is_null(),
                DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: JsonSchemaValueType::Null,
                }
            ),
            "boolean" => ensure!(
                value.is_boolean(),
                DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: JsonSchemaValueType::Boolean,
                }
            ),

            "number" => ensure!(
                value.is_number(),
                DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: JsonSchemaValueType::Number,
                }
            ),
            "integer" => ensure!(
                value.is_i64() || value.is_u64(),
                DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: JsonSchemaValueType::Integer,
                }
            ),
            "string" => ensure!(
                value.is_string(),
                DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: JsonSchemaValueType::String,
                }
            ),
            "array" => ensure!(
                value.is_array(),
                DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: JsonSchemaValueType::Array,
                }
            ),
            "object" => ensure!(
                value.is_object(),
                DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: JsonSchemaValueType::Object,
                }
            ),
            _ => {
                bail!(DataValidationError::UnknownType {
                    schema: self.json_type().to_owned()
                });
            }
        }

        for (additional_key, additional_property) in self.additional_properties() {
            match additional_key.as_str() {
                "const" => ensure!(
                    value == additional_property,
                    Report::new(DataTypeConstraint::Const {
                        actual: value.clone(),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                ),
                _ => bail!(
                    Report::new(DataTypeConstraint::Unknown {
                        key: additional_key.to_owned(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                ),
            }
        }

        Ok(())
    }
}

impl Validate<DataType, ()> for JsonValue {
    type Error = DataValidationError;

    #[expect(clippy::let_underscore_untyped, reason = "false positive")]
    async fn validate(&self, schema: &DataType, _: &()) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, &()).await
    }
}

impl<P> Schema<JsonValue, P> for DataTypeReference
where
    P: OntologyTypeProvider<DataType> + Sync,
{
    type Error = DataValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a JsonValue,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let data_type = provider
            .provide_type(self.url())
            .await
            .change_context_lazy(|| DataValidationError::DataTypeRetrieval {
                id: self.url().clone(),
            })?;
        data_type
            .borrow()
            .validate_value(value, provider)
            .await
            .attach_lazy(|| Expected::DataType(data_type.borrow().clone()))
            .attach_lazy(|| Actual::Json(value.clone()))
    }
}

impl<P> Validate<DataTypeReference, P> for JsonValue
where
    P: OntologyTypeProvider<DataType> + Sync,
{
    type Error = DataValidationError;

    async fn validate(
        &self,
        schema: &DataTypeReference,
        context: &P,
    ) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, context).await
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::tests::validate_data;

    #[tokio::test]
    async fn null() {
        validate_data(json!(null), graph_test_data::data_type::NULL_V1)
            .await
            .expect("validation failed");
    }

    #[tokio::test]
    async fn boolean() {
        validate_data(json!(true), graph_test_data::data_type::BOOLEAN_V1)
            .await
            .expect("validation failed");
    }

    #[tokio::test]
    async fn number() {
        validate_data(json!(42), graph_test_data::data_type::NUMBER_V1)
            .await
            .expect("validation failed");
    }

    #[tokio::test]
    async fn string() {
        validate_data(json!("foo"), graph_test_data::data_type::TEXT_V1)
            .await
            .expect("validation failed");
    }

    #[tokio::test]
    async fn array() {
        validate_data(json!([]), graph_test_data::data_type::EMPTY_LIST_V1)
            .await
            .expect("validation failed");

        _ = validate_data(
            json!(["foo", "bar"]),
            graph_test_data::data_type::EMPTY_LIST_V1,
        )
        .await
        .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn object() {
        validate_data(
            json!({
                "foo": "bar",
                "baz": "qux"
            }),
            graph_test_data::data_type::OBJECT_V1,
        )
        .await
        .expect("validation failed");
    }
}
