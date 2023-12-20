use core::{borrow::Borrow, fmt};
use std::str::FromStr;

use email_address::EmailAddress;
use error_stack::{bail, ensure, Report, ResultExt};
use regex::Regex;
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{url::VersionedUrl, DataType, DataTypeReference};
use url::Url;

use crate::{
    error::{Actual, Expected},
    OntologyTypeProvider, Schema, Validate, ValidationProfile,
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
    #[error("the provided value is not one of the expected values")]
    Enum {
        actual: JsonValue,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not greater than or equal to the minimum value, got `{actual}`, \
         expected `{expected}`"
    )]
    Minimum {
        actual: JsonValue,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not less than or equal to the maximum value, got `{actual}`, \
         expected `{expected}`"
    )]
    Maximum {
        actual: JsonValue,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not greater than the minimum value, got `{actual}`, expected \
         `{expected}`"
    )]
    ExclusiveMinimum {
        actual: JsonValue,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not less than the maximum value, got `{actual}`, expected \
         `{expected}`"
    )]
    ExclusiveMaximum {
        actual: JsonValue,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not a multiple of the expected value, got `{actual}`, expected \
         `{expected}`"
    )]
    MultipleOf {
        actual: JsonValue,
        expected: JsonValue,
    },
    #[error(
        "the provided value is shorter than the minimum length, got `{actual}`, expected \
         a string of at least length `{expected}`"
    )]
    MinLength { actual: String, expected: usize },
    #[error(
        "the provided value is longer than the maximum length, got `{actual}`, expected \
         a string of at most length `{expected}`"
    )]
    MaxLength { actual: String, expected: usize },
    #[error("the provided pattern could not be compiled, got `{pattern}`")]
    InvalidPattern { pattern: String },
    #[error("the provided value does not match the expected pattern `{pattern}`, got `{actual}`")]
    Pattern { actual: String, pattern: Regex },
    #[error("the provided value does not match the expected format `{format}`")]
    Format { actual: JsonValue, format: String },
    #[error("unknown constraint: `{key}`")]
    UnknownConstraint { key: String },
    #[error("unknown format: `{key}`")]
    UnknownFormat { key: String },
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

fn as_usize(number: &JsonValue) -> Result<usize, Report<DataValidationError>> {
    usize::try_from(number.as_u64().ok_or_else(|| {
        Report::new(DataValidationError::InvalidType {
            actual: JsonSchemaValueType::from(number),
            expected: JsonSchemaValueType::Integer,
        })
    })?)
    .change_context(DataValidationError::ConstraintUnfulfilled)
}

fn check_numeric_additional_property<'a, T>(
    value: &JsonValue,
    additional_properties: impl IntoIterator<Item = (impl AsRef<str>, &'a JsonValue)>,
    expected_type: JsonSchemaValueType,
    from_json_value: impl Fn(&JsonValue) -> Option<T>,
    multiple_of: impl Fn(&T, &T) -> bool,
) -> Result<(), Report<DataValidationError>>
where
    T: PartialOrd,
{
    let number = from_json_value(value).ok_or_else(|| {
        Report::new(DataValidationError::InvalidType {
            actual: JsonSchemaValueType::from(value),
            expected: expected_type,
        })
    })?;
    for (additional_key, additional_property) in additional_properties {
        match (
            additional_key.as_ref(),
            from_json_value(additional_property),
        ) {
            ("minimum", Some(minimum)) => {
                ensure!(
                    number >= minimum,
                    Report::new(DataTypeConstraint::Minimum {
                        actual: value.clone(),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("maximum", Some(maximum)) => {
                ensure!(
                    number <= maximum,
                    Report::new(DataTypeConstraint::Maximum {
                        actual: value.clone(),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("exclusiveMinimum", Some(minimum)) => {
                ensure!(
                    number > minimum,
                    Report::new(DataTypeConstraint::ExclusiveMinimum {
                        actual: value.clone(),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("exclusiveMaximum", Some(maximum)) => {
                ensure!(
                    number < maximum,
                    Report::new(DataTypeConstraint::ExclusiveMaximum {
                        actual: value.clone(),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("multipleOf", Some(multiple)) => {
                ensure!(
                    multiple_of(&number, &multiple),
                    Report::new(DataTypeConstraint::MultipleOf {
                        actual: value.clone(),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            (
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf",
                None,
            ) => {
                bail!(Report::new(DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: expected_type,
                }));
            }
            _ => {}
        }
    }
    Ok(())
}

fn check_string_additional_property<'a>(
    value: &JsonValue,
    additional_properties: impl IntoIterator<Item = (impl AsRef<str>, &'a JsonValue)>,
    expected_type: JsonSchemaValueType,
    from_json_value: impl Fn(&JsonValue) -> Option<&str>,
) -> Result<(), Report<DataValidationError>> {
    let string = from_json_value(value).ok_or_else(|| {
        Report::new(DataValidationError::InvalidType {
            actual: JsonSchemaValueType::from(value),
            expected: expected_type,
        })
    })?;
    for (additional_key, additional_property) in additional_properties {
        match (additional_key.as_ref(), additional_property) {
            ("format", JsonValue::String(additional_property)) => {
                match additional_property.as_str() {
                    "uri" => {
                        Url::parse(string)
                            .change_context_lazy(|| DataTypeConstraint::Format {
                                actual: value.clone(),
                                format: additional_property.to_owned(),
                            })
                            .change_context(DataValidationError::ConstraintUnfulfilled)?;
                    }
                    "email" => {
                        EmailAddress::from_str(string)
                            .change_context_lazy(|| DataTypeConstraint::Format {
                                actual: value.clone(),
                                format: additional_property.to_owned(),
                            })
                            .change_context(DataValidationError::ConstraintUnfulfilled)?;
                    }
                    _ => {
                        bail!(
                            Report::new(DataTypeConstraint::UnknownFormat {
                                key: additional_key.as_ref().to_owned(),
                            })
                            .change_context(DataValidationError::ConstraintUnfulfilled)
                        );
                    }
                }
            }
            ("minLength", minimum) => {
                let minimum = as_usize(minimum)?;
                ensure!(
                    string.len() >= minimum,
                    Report::new(DataTypeConstraint::MinLength {
                        actual: string.to_owned(),
                        expected: minimum,
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("maxLength", maximum) => {
                let maximum = as_usize(maximum)?;
                ensure!(
                    string.len() <= maximum,
                    Report::new(DataTypeConstraint::MaxLength {
                        actual: string.to_owned(),
                        expected: maximum,
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("pattern", JsonValue::String(pattern)) => {
                let regex = Regex::new(pattern)
                    .change_context_lazy(|| DataTypeConstraint::InvalidPattern {
                        pattern: pattern.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)?;
                ensure!(
                    regex.is_match(string),
                    Report::new(DataTypeConstraint::Pattern {
                        actual: string.to_owned(),
                        pattern: regex,
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("format" | "pattern", _) => {
                bail!(Report::new(DataValidationError::InvalidType {
                    actual: JsonSchemaValueType::from(value),
                    expected: JsonSchemaValueType::String,
                }));
            }
            _ => {}
        }
    }
    Ok(())
}

impl<P: Sync> Schema<JsonValue, P> for DataType {
    type Error = DataValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a JsonValue,
        _profile: ValidationProfile,
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

            "number" => {
                #[expect(clippy::float_arithmetic)]
                check_numeric_additional_property(
                    value,
                    self.additional_properties(),
                    JsonSchemaValueType::Number,
                    JsonValue::as_f64,
                    |number, multiple| number % multiple < f64::EPSILON,
                )?;
            }
            "integer" => {
                check_numeric_additional_property(
                    value,
                    self.additional_properties(),
                    JsonSchemaValueType::Integer,
                    JsonValue::as_i64,
                    |number, multiple| number % multiple == 0,
                )?;
            }
            "string" => {
                check_string_additional_property(
                    value,
                    self.additional_properties(),
                    JsonSchemaValueType::String,
                    JsonValue::as_str,
                )?;
            }
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
                "enum" => {
                    ensure!(
                        additional_property
                            .as_array()
                            .is_some_and(|array| array.contains(value)),
                        Report::new(DataTypeConstraint::Enum {
                            actual: value.clone(),
                            expected: additional_property.clone(),
                        })
                        .change_context(DataValidationError::ConstraintUnfulfilled)
                    );
                }
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                    if self.json_type() == "integer" || self.json_type() == "number" => {}
                "format" | "minLength" | "maxLength" | "pattern"
                    if self.json_type() == "string" => {}
                "label" => {
                    // Label does not have to be validated
                }
                _ => bail!(
                    Report::new(DataTypeConstraint::UnknownConstraint {
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

    async fn validate(
        &self,
        schema: &DataType,
        profile: ValidationProfile,
        (): &(),
    ) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, profile, &()).await
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
        profile: ValidationProfile,
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
            .validate_value(value, profile, provider)
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
        profile: ValidationProfile,
        context: &P,
    ) -> Result<(), Report<Self::Error>> {
        schema.validate_value(self, profile, context).await
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::{tests::validate_data, ValidationProfile};

    #[tokio::test]
    async fn null() {
        validate_data(
            json!(null),
            graph_test_data::data_type::NULL_V1,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn boolean() {
        validate_data(
            json!(true),
            graph_test_data::data_type::BOOLEAN_V1,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn number() {
        validate_data(
            json!(42),
            graph_test_data::data_type::NUMBER_V1,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn string() {
        validate_data(
            json!("foo"),
            graph_test_data::data_type::TEXT_V1,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn array() {
        validate_data(
            json!([]),
            graph_test_data::data_type::EMPTY_LIST_V1,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_data(
            json!(["foo", "bar"]),
            graph_test_data::data_type::EMPTY_LIST_V1,
            ValidationProfile::Full,
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
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");
    }

    #[tokio::test]
    async fn temperature_unit() {
        let meter_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/temperature-unit/v/1",
            "title": "Temperature Unit",
            "type": "string",
            "enum": ["Celsius", "Fahrenheit", "Kelvin"]
        }))
        .expect("failed to serialize temperature unit type");

        validate_data(json!("Celsius"), &meter_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!("Fahrenheit"), &meter_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        _ = validate_data(json!("foo"), &meter_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn meter() {
        let meter_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/meter/v/1",
            "title": "Meter",
            "type": "number",
            "minimum": 0,
        }))
        .expect("failed to serialize meter type");

        validate_data(json!(10), &meter_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!(0.0), &meter_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        _ = validate_data(json!(-1.0), &meter_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn uri() {
        let url_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/url/v/1",
            "title": "Url",
            "type": "string",
            "format": "uri",
        }))
        .expect("failed to serialize meter type");

        validate_data(json!("localhost:3000"), &url_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(
            json!("https://blockprotocol.org/types/modules/graph/0.3/schema/data-type"),
            &url_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_data(json!("10"), &url_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn email() {
        let mail_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/email/v/1",
            "title": "E-Mail",
            "type": "string",
            "format": "email",
        }))
        .expect("failed to serialize meter type");

        validate_data(
            json!("bob@example.com"),
            &mail_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_data(
            json!("user.name+tag+sorting@example.com"),
            &mail_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_data(json!("job!done"), &mail_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn simple_mail() {
        let mail_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/simple-email/v/1",
            "title": "E-Mail",
            "type": "string",
            "pattern": "^[^@]+@[^@]+$",
        }))
        .expect("failed to serialize simple mail type");

        validate_data(
            json!("bob@example.com"),
            &mail_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_data(
            json!("user.name+tag+sorting@example.com"),
            &mail_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_data(json!("job!done"), &mail_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn short_string() {
        let url_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/short-string/v/1",
            "title": "Short string",
            "type": "string",
            "minLength": 1,
            "maxLength": 10,
        }))
        .expect("failed to serialize short string type");

        validate_data(json!("foo"), &url_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        _ = validate_data(json!(""), &url_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");

        _ = validate_data(json!("foo bar baz"), &url_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }
}
