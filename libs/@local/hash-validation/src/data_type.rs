use core::fmt;
use std::{borrow::Borrow, fmt::Formatter};

use error_stack::{bail, ensure, Report, ResultExt};
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{url::VersionedUrl, DataType, DataTypeReference};

use crate::{
    error::{Actual, Expected},
    OntologyTypeProvider, Schema, Validate,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JsonValueType {
    Null,
    Boolean,
    Number,
    Integer,
    String,
    Array,
    Object,
}

impl fmt::Display for JsonValueType {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        match self {
            JsonValueType::Null => fmt.write_str("null"),
            JsonValueType::Boolean => fmt.write_str("boolean"),
            JsonValueType::Number => fmt.write_str("number"),
            JsonValueType::Integer => fmt.write_str("integer"),
            JsonValueType::String => fmt.write_str("string"),
            JsonValueType::Array => fmt.write_str("array"),
            JsonValueType::Object => fmt.write_str("object"),
        }
    }
}

impl From<&JsonValue> for JsonValueType {
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
pub enum DataTypeValidationError {
    #[error("the validator was unable to read the data type: `{id}`")]
    DataTypeRetrieval { id: VersionedUrl },
    #[error(
        "the value provided does not match the data type, expected `{expected}`, got `{actual}`"
    )]
    InvalidType {
        actual: JsonValueType,
        expected: JsonValueType,
    },
    #[error("a constraint was not fulfilled")]
    ConstraintUnfulfilled,
    #[error("the schema contains an unknown data type: `{schema}`")]
    UnknownType { schema: String },
}

impl<P: Sync> Schema<JsonValue, P> for DataType {
    type Error = DataTypeValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a JsonValue,
        _provider: &'a P,
    ) -> Result<(), Report<DataTypeValidationError>> {
        match self.json_type() {
            "null" => ensure!(
                value.is_null(),
                DataTypeValidationError::InvalidType {
                    actual: JsonValueType::from(value),
                    expected: JsonValueType::Null,
                }
            ),
            "boolean" => ensure!(
                value.is_boolean(),
                DataTypeValidationError::InvalidType {
                    actual: JsonValueType::from(value),
                    expected: JsonValueType::Boolean,
                }
            ),

            "number" => ensure!(
                value.is_number(),
                DataTypeValidationError::InvalidType {
                    actual: JsonValueType::from(value),
                    expected: JsonValueType::Number,
                }
            ),
            "integer" => ensure!(
                value.is_i64() || value.is_u64(),
                DataTypeValidationError::InvalidType {
                    actual: JsonValueType::from(value),
                    expected: JsonValueType::Integer,
                }
            ),
            "string" => ensure!(
                value.is_string(),
                DataTypeValidationError::InvalidType {
                    actual: JsonValueType::from(value),
                    expected: JsonValueType::String,
                }
            ),
            "array" => ensure!(
                value.is_array(),
                DataTypeValidationError::InvalidType {
                    actual: JsonValueType::from(value),
                    expected: JsonValueType::Array,
                }
            ),
            "object" => ensure!(
                value.is_object(),
                DataTypeValidationError::InvalidType {
                    actual: JsonValueType::from(value),
                    expected: JsonValueType::Object,
                }
            ),
            _ => {
                bail!(DataTypeValidationError::UnknownType {
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
                    .change_context(DataTypeValidationError::ConstraintUnfulfilled)
                ),
                _ => bail!(
                    Report::new(DataTypeConstraint::Unknown {
                        key: additional_key.to_owned(),
                    })
                    .change_context(DataTypeValidationError::ConstraintUnfulfilled)
                ),
            }
        }

        Ok(())
    }
}

impl Validate<DataType, ()> for JsonValue {
    type Error = DataTypeValidationError;

    async fn validate(&self, schema: &DataType, _: &()) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, &()).await
    }
}

impl<P> Schema<JsonValue, P> for DataTypeReference
where
    P: OntologyTypeProvider<DataType> + Sync,
{
    type Error = DataTypeValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a JsonValue,
        provider: &'a P,
    ) -> Result<(), Report<Self::Error>> {
        let data_type = provider
            .provide_type(self.url())
            .await
            .change_context_lazy(|| DataTypeValidationError::DataTypeRetrieval {
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
    type Error = DataTypeValidationError;

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
