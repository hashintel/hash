use core::{borrow::Borrow, fmt};
use std::{
    net::{Ipv4Addr, Ipv6Addr},
    str::FromStr,
};

use chrono::{DateTime, NaiveDate};
use email_address::EmailAddress;
use error_stack::{bail, ensure, Report, ResultExt};
use iso8601_duration::Duration;
use regex::Regex;
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{url::VersionedUrl, DataType, DataTypeReference};
use url::Url;
use uuid::Uuid;

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
        "the provided value is shorter than the minimum length, got `{actual}`, expected a string \
         of at least length `{expected}`"
    )]
    MinLength { actual: String, expected: usize },
    #[error(
        "the provided value is longer than the maximum length, got `{actual}`, expected a string \
         of at most length `{expected}`"
    )]
    MaxLength { actual: String, expected: usize },
    #[error("the provided pattern could not be compiled, got `{pattern}`")]
    InvalidPattern { pattern: String },
    #[error("the provided value does not match the expected pattern `{pattern}`, got `{actual}`")]
    Pattern { actual: String, pattern: Regex },
    #[error("the provided value `{actual}` does not match the expected format `{format}`")]
    Format {
        actual: String,
        format: &'static str,
    },
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
                        actual: value.to_owned(),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("maximum", Some(maximum)) => {
                ensure!(
                    number <= maximum,
                    Report::new(DataTypeConstraint::Maximum {
                        actual: value.to_owned(),
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

fn check_format(value: &str, format: &str) -> Result<(), Report<DataValidationError>> {
    match format {
        "uri" => {
            Url::parse(value)
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "uri",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "uuid" => {
            Uuid::parse_str(value)
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "uuid",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "regex" => {
            Regex::new(value)
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "regex",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "email" => {
            EmailAddress::from_str(value)
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "email",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "ipv4" => {
            value
                .parse::<Ipv4Addr>()
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "ipv4",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "ipv6" => {
            value
                .parse::<Ipv6Addr>()
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "ipv6",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "hostname" => {
            url::Host::parse(value)
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "hostname",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "date-time" => {
            DateTime::parse_from_rfc3339(value)
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "date-time",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "date" => {
            NaiveDate::from_str(value)
                .change_context_lazy(|| DataTypeConstraint::Format {
                    actual: value.to_owned(),
                    format: "date",
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        "duration" => {
            value
                .parse::<Duration>()
                .map_err(|error| {
                    Report::new(DataTypeConstraint::Format {
                        actual: value.to_owned(),
                        format: "duration",
                    })
                    .attach_printable(format!("{error:?}"))
                })
                .change_context(DataValidationError::ConstraintUnfulfilled)?;
        }
        _ => bail!(
            Report::new(DataTypeConstraint::UnknownFormat {
                key: format.to_owned(),
            })
            .change_context(DataValidationError::ConstraintUnfulfilled)
        ),
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
                check_format(string, additional_property)?;
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

    #[expect(clippy::too_many_lines)]
    async fn validate_value<'a>(
        &'a self,
        value: &'a JsonValue,
        _: ValidationProfile,
        _: &'a P,
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
    async fn zip_code_us() {
        let zip_code = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/zip-code-us/v/1",
            "title": "Zip code (US)",
            "type": "string",
            "pattern": "^[0-9]{5}(?:-[0-9]{4})?$",
        }))
        .expect("failed to serialize zip code type");

        validate_data(json!("12345"), &zip_code, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!("12345-6789"), &zip_code, ValidationProfile::Full)
            .await
            .expect("validation failed");

        _ = validate_data(json!("1234"), &zip_code, ValidationProfile::Full)
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

    #[tokio::test]
    #[expect(clippy::too_many_lines, reason = "Most lines are just test data")]
    async fn date_time() {
        // TODO: Allow dates which are allowed in RFC3339
        const VALID_FORMATS: &[&str] = &[
            "2023-12-22T12:15:01Z",
            "2023-12-22T12:15:01.1Z",
            "2023-12-22T12:15:01.18Z",
            "2023-12-22T12:15:01.187Z",
            "2023-12-22T12:15:01.187226Z",
            "2023-12-22T13:15:01+01:00",
            "2023-12-22T13:15:01.187+01:00",
            "2023-12-22T13:15:01.187226+01:00",
            "2023-12-22T12:15:01-00:00",
            "2023-12-22T12:15:01.187-00:00",
            "2023-12-22T21:00:01+08:45",
            "2023-12-22T12:15:01+00:00",
            "2023-12-22T12:15:01.187+00:00",
            "2023-12-22t12:15:01z",
            "2023-12-22t12:15:01.187z",
            "2023-12-22 13:15:01+01:00",
            "2023-12-22 13:15:01.1+01:00",
            "2023-12-22 13:15:01.18+01:00",
            "2023-12-22 13:15:01.187+01:00",
            "2023-12-22 13:15:01.187226+01:00",
            "2023-12-22 12:15:01Z",
            "2023-12-22 12:15:01z",
            "2023-12-22 12:15:01.1Z",
            "2023-12-22 12:15:01.18Z",
            "2023-12-22 12:15:01.187Z",
            "2023-12-22 12:15:01.187226Z",
            "2023-12-22 12:15:01.187z",
            "2023-12-22 12:15:01.187226z",
            "2023-12-22 12:15:01-00:00",
            "2023-12-22 12:15:01.187-00:00",
            // "2023-12-22_12:15:01Z",
            // "2023-12-22_12:15:01z",
            // "2023-12-22_12:15:01.187Z",
            // "2023-12-22_12:15:01.187226Z",
            // "2023-12-22_12:15:01.187z",
            // "2023-12-22_12:15:01.187226z",
        ];

        // TODO: A few formats were validated as valid but are not valid according to RFC3339:
        //       - "2023-12-22T13:58:26.9+01:00" (%Y-%M-%DT%h:%m:%.1s%Z:%z)
        //       - "2023-12-22T13:58:26.95+01:00" (%Y-%M-%DT%h:%m:%.2s%Z:%z)
        const INVALID_FORMATS: &[&str] = &[
            "2023-12-22T13",                    // %Y-%M-%DT%h
            "2023-12-22T13,9",                  // %Y-%M-%DT%,1h
            "2023-12-22T13.9",                  // %Y-%M-%DT%.1h
            "2023-12-22T13:58",                 // %Y-%M-%DT%h:%m
            "2023-12-22T13:58,4",               // %Y-%M-%DT%h:%,1m
            "2023-12-22T13:58.4",               // %Y-%M-%DT%h:%.1m
            "2023-12-22T13:58:26",              // %Y-%M-%DT%h:%m:%s
            "2023-12-22T13:58:26.9",            // %Y-%M-%DT%h:%m:%.1s
            "2023-12-22T13:58:26.95",           // %Y-%M-%DT%h:%m:%.2s
            "2023-12-22T13:58:26,950",          // %Y-%M-%DT%h:%m:%,3s
            "2023-12-22T13:58:26.950",          // %Y-%M-%DT%h:%m:%.3s
            "2023-12-22T13:58:26,950086",       // %Y-%M-%DT%h:%m:%s,%u
            "2023-12-22T13:58:26.950086",       // %Y-%M-%DT%h:%m:%s.%u
            "2023-12-22T12Z",                   // %Y-%M-%DT%hZ
            "2023-12-22T12,9Z",                 // %Y-%M-%DT%,1hZ
            "2023-12-22T12.9Z",                 // %Y-%M-%DT%.1hZ
            "2023-12-22T12:58Z",                // %Y-%M-%DT%h:%mZ
            "2023-12-22T12:58,4Z",              // %Y-%M-%DT%h:%,1mZ
            "2023-12-22T12:58.4Z",              // %Y-%M-%DT%h:%.1mZ
            "2023-12-22T12:58:26,950Z",         // %Y-%M-%DT%h:%m:%,3sZ
            "2023-12-22T12:58:26,950086Z",      // %Y-%M-%DT%h:%m:%s,%uZ
            "2023-12-22T13+01",                 // %Y-%M-%DT%h%Z
            "2023-12-22T13,9+01",               // %Y-%M-%DT%,1h%Z
            "2023-12-22T13.9+01",               // %Y-%M-%DT%.1h%Z
            "2023-12-22T13:58+01",              // %Y-%M-%DT%h:%m%Z
            "2023-12-22T13:58,4+01",            // %Y-%M-%DT%h:%,1m%Z
            "2023-12-22T13:58.4+01",            // %Y-%M-%DT%h:%.1m%Z
            "2023-12-22T13:58:26+01",           // %Y-%M-%DT%h:%m:%s%Z
            "2023-12-22T13:58:26.9+01",         // %Y-%M-%DT%h:%m:%.1s%Z
            "2023-12-22T13:58:26.95+01",        // %Y-%M-%DT%h:%m:%.2s%Z
            "2023-12-22T13:58:26,950+01",       // %Y-%M-%DT%h:%m:%,3s%Z
            "2023-12-22T13:58:26.950+01",       // %Y-%M-%DT%h:%m:%.3s%Z
            "2023-12-22T13:58:26,950086+01",    // %Y-%M-%DT%h:%m:%s,%u%Z
            "2023-12-22T13:58:26.950086+01",    // %Y-%M-%DT%h:%m:%s.%u%Z
            "2023-12-22T13+01:00",              // %Y-%M-%DT%h%Z:%z
            "2023-12-22T13,9+01:00",            // %Y-%M-%DT%,1h%Z:%z
            "2023-12-22T13.9+01:00",            // %Y-%M-%DT%.1h%Z:%z
            "2023-12-22T13:58+01:00",           // %Y-%M-%DT%h:%m%Z:%z
            "2023-12-22T13:58,4+01:00",         // %Y-%M-%DT%h:%,1m%Z:%z
            "2023-12-22T13:58.4+01:00",         // %Y-%M-%DT%h:%.1m%Z:%z
            "2023-12-22T13:58:26,950+01:00",    // %Y-%M-%DT%h:%m:%,3s%Z:%z
            "2023-12-22T13:58:26,950086+01:00", // %Y-%M-%DT%h:%m:%s,%u%Z:%z
            "2023-W51-5T13",                    // %V-W%W-%wT%h
            "2023-W51-5T13,9",                  // %V-W%W-%wT%,1h
            "2023-W51-5T13.9",                  // %V-W%W-%wT%.1h
            "2023-W51-5T13:58",                 // %V-W%W-%wT%h:%m
            "2023-W51-5T13:58,4",               // %V-W%W-%wT%h:%,1m
            "2023-W51-5T13:58.4",               // %V-W%W-%wT%h:%.1m
            "2023-W51-5T13:58:26",              // %V-W%W-%wT%h:%m:%s
            "2023-W51-5T13:58:26.9",            // %V-W%W-%wT%h:%m:%.1s
            "2023-W51-5T13:58:26.95",           // %V-W%W-%wT%h:%m:%.2s
            "2023-W51-5T13:58:26,950",          // %V-W%W-%wT%h:%m:%,3s
            "2023-W51-5T13:58:26.950",          // %V-W%W-%wT%h:%m:%.3s
            "2023-W51-5T13:58:26,950086",       // %V-W%W-%wT%h:%m:%s,%u
            "2023-W51-5T13:58:26.950086",       // %V-W%W-%wT%h:%m:%s.%u
            "2023-W51-5T12Z",                   // %V-W%W-%wT%hZ
            "2023-W51-5T12,9Z",                 // %V-W%W-%wT%,1hZ
            "2023-W51-5T12.9Z",                 // %V-W%W-%wT%.1hZ
            "2023-W51-5T12:58Z",                // %V-W%W-%wT%h:%mZ
            "2023-W51-5T12:58,4Z",              // %V-W%W-%wT%h:%,1mZ
            "2023-W51-5T12:58.4Z",              // %V-W%W-%wT%h:%.1mZ
            "2023-W51-5T12:58:26Z",             // %V-W%W-%wT%h:%m:%sZ
            "2023-W51-5T12:58:26.9Z",           // %V-W%W-%wT%h:%m:%.1sZ
            "2023-W51-5T12:58:26.95Z",          // %V-W%W-%wT%h:%m:%.2sZ
            "2023-W51-5T12:58:26,950Z",         // %V-W%W-%wT%h:%m:%,3sZ
            "2023-W51-5T12:58:26.950Z",         // %V-W%W-%wT%h:%m:%.3sZ
            "2023-W51-5T12:58:26,950086Z",      // %V-W%W-%wT%h:%m:%s,%uZ
            "2023-W51-5T12:58:26.950086Z",      // %V-W%W-%wT%h:%m:%s.%uZ
            "2023-W51-5T13+01",                 // %V-W%W-%wT%h%Z
            "2023-W51-5T13,9+01",               // %V-W%W-%wT%,1h%Z
            "2023-W51-5T13.9+01",               // %V-W%W-%wT%.1h%Z
            "2023-W51-5T13:58+01",              // %V-W%W-%wT%h:%m%Z
            "2023-W51-5T13:58,4+01",            // %V-W%W-%wT%h:%,1m%Z
            "2023-W51-5T13:58.4+01",            // %V-W%W-%wT%h:%.1m%Z
            "2023-W51-5T13:58:26+01",           // %V-W%W-%wT%h:%m:%s%Z
            "2023-W51-5T13:58:26.9+01",         // %V-W%W-%wT%h:%m:%.1s%Z
            "2023-W51-5T13:58:26.95+01",        // %V-W%W-%wT%h:%m:%.2s%Z
            "2023-W51-5T13:58:26,950+01",       // %V-W%W-%wT%h:%m:%,3s%Z
            "2023-W51-5T13:58:26.950+01",       // %V-W%W-%wT%h:%m:%.3s%Z
            "2023-W51-5T13:58:26,950086+01",    // %V-W%W-%wT%h:%m:%s,%u%Z
            "2023-W51-5T13:58:26.950086+01",    // %V-W%W-%wT%h:%m:%s.%u%Z
            "2023-W51-5T13+01:00",              // %V-W%W-%wT%h%Z:%z
            "2023-W51-5T13,9+01:00",            // %V-W%W-%wT%,1h%Z:%z
            "2023-W51-5T13.9+01:00",            // %V-W%W-%wT%.1h%Z:%z
            "2023-W51-5T13:58+01:00",           // %V-W%W-%wT%h:%m%Z:%z
            "2023-W51-5T13:58,4+01:00",         // %V-W%W-%wT%h:%,1m%Z:%z
            "2023-W51-5T13:58.4+01:00",         // %V-W%W-%wT%h:%.1m%Z:%z
            "2023-W51-5T13:58:26+01:00",        // %V-W%W-%wT%h:%m:%s%Z:%z
            "2023-W51-5T13:58:26.9+01:00",      // %V-W%W-%wT%h:%m:%.1s%Z:%z
            "2023-W51-5T13:58:26.95+01:00",     // %V-W%W-%wT%h:%m:%.2s%Z:%z
            "2023-W51-5T13:58:26,950+01:00",    // %V-W%W-%wT%h:%m:%,3s%Z:%z
            "2023-W51-5T13:58:26.950+01:00",    // %V-W%W-%wT%h:%m:%.3s%Z:%z
            "2023-W51-5T13:58:26,950086+01:00", // %V-W%W-%wT%h:%m:%s,%u%Z:%z
            "2023-W51-5T13:58:26.950086+01:00", // %V-W%W-%wT%h:%m:%s.%u%Z:%z
            "2023-356T13",                      // %Y-%OT%h
            "2023-356T13,9",                    // %Y-%OT%,1h
            "2023-356T13.9",                    // %Y-%OT%.1h
            "2023-356T13:58",                   // %Y-%OT%h:%m
            "2023-356T13:58,4",                 // %Y-%OT%h:%,1m
            "2023-356T13:58.4",                 // %Y-%OT%h:%.1m
            "2023-356T13:58:26",                // %Y-%OT%h:%m:%s
            "2023-356T13:58:26.9",              // %Y-%OT%h:%m:%.1s
            "2023-356T13:58:26.95",             // %Y-%OT%h:%m:%.2s
            "2023-356T13:58:26,950",            // %Y-%OT%h:%m:%,3s
            "2023-356T13:58:26.950",            // %Y-%OT%h:%m:%.3s
            "2023-356T13:58:26,950086",         // %Y-%OT%h:%m:%s,%u
            "2023-356T13:58:26.950086",         // %Y-%OT%h:%m:%s.%u
            "2023-356T12Z",                     // %Y-%OT%hZ
            "2023-356T12,9Z",                   // %Y-%OT%,1hZ
            "2023-356T12.9Z",                   // %Y-%OT%.1hZ
            "2023-356T12:58Z",                  // %Y-%OT%h:%mZ
            "2023-356T12:58,4Z",                // %Y-%OT%h:%,1mZ
            "2023-356T12:58.4Z",                // %Y-%OT%h:%.1mZ
            "2023-356T12:58:26Z",               // %Y-%OT%h:%m:%sZ
            "2023-356T12:58:26.9Z",             // %Y-%OT%h:%m:%.1sZ
            "2023-356T12:58:26.95Z",            // %Y-%OT%h:%m:%.2sZ
            "2023-356T12:58:26,950Z",           // %Y-%OT%h:%m:%,3sZ
            "2023-356T12:58:26.950Z",           // %Y-%OT%h:%m:%.3sZ
            "2023-356T12:58:26,950086Z",        // %Y-%OT%h:%m:%s,%uZ
            "2023-356T12:58:26.950086Z",        // %Y-%OT%h:%m:%s.%uZ
            "2023-356T13+01",                   // %Y-%OT%h%Z
            "2023-356T13,9+01",                 // %Y-%OT%,1h%Z
            "2023-356T13.9+01",                 // %Y-%OT%.1h%Z
            "2023-356T13:58+01",                // %Y-%OT%h:%m%Z
            "2023-356T13:58,4+01",              // %Y-%OT%h:%,1m%Z
            "2023-356T13:58.4+01",              // %Y-%OT%h:%.1m%Z
            "2023-356T13:58:26+01",             // %Y-%OT%h:%m:%s%Z
            "2023-356T13:58:26.9+01",           // %Y-%OT%h:%m:%.1s%Z
            "2023-356T13:58:26.95+01",          // %Y-%OT%h:%m:%.2s%Z
            "2023-356T13:58:26,950+01",         // %Y-%OT%h:%m:%,3s%Z
            "2023-356T13:58:26.950+01",         // %Y-%OT%h:%m:%.3s%Z
            "2023-356T13:58:26,950086+01",      // %Y-%OT%h:%m:%s,%u%Z
            "2023-356T13:58:26.950086+01",      // %Y-%OT%h:%m:%s.%u%Z
            "2023-356T13+01:00",                // %Y-%OT%h%Z:%z
            "2023-356T13,9+01:00",              // %Y-%OT%,1h%Z:%z
            "2023-356T13.9+01:00",              // %Y-%OT%.1h%Z:%z
            "2023-356T13:58+01:00",             // %Y-%OT%h:%m%Z:%z
            "2023-356T13:58,4+01:00",           // %Y-%OT%h:%,1m%Z:%z
            "2023-356T13:58.4+01:00",           // %Y-%OT%h:%.1m%Z:%z
            "2023-356T13:58:26+01:00",          // %Y-%OT%h:%m:%s%Z:%z
            "2023-356T13:58:26.9+01:00",        // %Y-%OT%h:%m:%.1s%Z:%z
            "2023-356T13:58:26.95+01:00",       // %Y-%OT%h:%m:%.2s%Z:%z
            "2023-356T13:58:26,950+01:00",      // %Y-%OT%h:%m:%,3s%Z:%z
            "2023-356T13:58:26.950+01:00",      // %Y-%OT%h:%m:%.3s%Z:%z
            "2023-356T13:58:26,950086+01:00",   // %Y-%OT%h:%m:%s,%u%Z:%z
            "2023-356T13:58:26.950086+01:00",   // %Y-%OT%h:%m:%s.%u%Z:%z
            "20231222T13",                      // %Y%M%DT%h
            "20231222T13,9",                    // %Y%M%DT%,1h
            "20231222T13.9",                    // %Y%M%DT%.1h
            "20231222T1358",                    // %Y%M%DT%h%m
            "20231222T1358,4",                  // %Y%M%DT%h%,1m
            "20231222T1358.4",                  // %Y%M%DT%h%.1m
            "20231222T135826",                  // %Y%M%DT%h%m%s
            "20231222T135826.9",                // %Y%M%DT%h%m%.1s
            "20231222T135826.95",               // %Y%M%DT%h%m%.2s
            "20231222T135826,950",              // %Y%M%DT%h%m%,3s
            "20231222T135826.950",              // %Y%M%DT%h%m%.3s
            "20231222T135826,950086",           // %Y%M%DT%h%m%s,%u
            "20231222T135826.950086",           // %Y%M%DT%h%m%s.%u
            "20231222T12Z",                     // %Y%M%DT%hZ
            "20231222T12,9Z",                   // %Y%M%DT%,1hZ
            "20231222T12.9Z",                   // %Y%M%DT%.1hZ
            "20231222T1258Z",                   // %Y%M%DT%h%mZ
            "20231222T1258,4Z",                 // %Y%M%DT%h%,1mZ
            "20231222T1258.4Z",                 // %Y%M%DT%h%.1mZ
            "20231222T125826Z",                 // %Y%M%DT%h%m%sZ
            "20231222T125826.9Z",               // %Y%M%DT%h%m%.1sZ
            "20231222T125826.95Z",              // %Y%M%DT%h%m%.2sZ
            "20231222T125826,950Z",             // %Y%M%DT%h%m%,3sZ
            "20231222T125826.950Z",             // %Y%M%DT%h%m%.3sZ
            "20231222T125826,950086Z",          // %Y%M%DT%h%m%s,%uZ
            "20231222T125826.950086Z",          // %Y%M%DT%h%m%s.%uZ
            "20231222T13+01",                   // %Y%M%DT%h%Z
            "20231222T13,9+01",                 // %Y%M%DT%,1h%Z
            "20231222T13.9+01",                 // %Y%M%DT%.1h%Z
            "20231222T1358+01",                 // %Y%M%DT%h%m%Z
            "20231222T1358,4+01",               // %Y%M%DT%h%,1m%Z
            "20231222T1358.4+01",               // %Y%M%DT%h%.1m%Z
            "20231222T135826+01",               // %Y%M%DT%h%m%s%Z
            "20231222T135826.9+01",             // %Y%M%DT%h%m%.1s%Z
            "20231222T135826.95+01",            // %Y%M%DT%h%m%.2s%Z
            "20231222T135826,950+01",           // %Y%M%DT%h%m%,3s%Z
            "20231222T135826.950+01",           // %Y%M%DT%h%m%.3s%Z
            "20231222T135826,950086+01",        // %Y%M%DT%h%m%s,%u%Z
            "20231222T135826.950086+01",        // %Y%M%DT%h%m%s.%u%Z
            "20231222T13+0100",                 // %Y%M%DT%h%Z%z
            "20231222T13,9+0100",               // %Y%M%DT%,1h%Z%z
            "20231222T13.9+0100",               // %Y%M%DT%.1h%Z%z
            "20231222T1358+0100",               // %Y%M%DT%h%m%Z%z
            "20231222T1358,4+0100",             // %Y%M%DT%h%,1m%Z%z
            "20231222T1358.4+0100",             // %Y%M%DT%h%.1m%Z%z
            "20231222T135826+0100",             // %Y%M%DT%h%m%s%Z%z
            "20231222T135826.9+0100",           // %Y%M%DT%h%m%.1s%Z%z
            "20231222T135826.95+0100",          // %Y%M%DT%h%m%.2s%Z%z
            "20231222T135826,950+0100",         // %Y%M%DT%h%m%,3s%Z%z
            "20231222T135826.950+0100",         // %Y%M%DT%h%m%.3s%Z%z
            "20231222T135826,950086+0100",      // %Y%M%DT%h%m%s,%u%Z%z
            "20231222T135826.950086+0100",      // %Y%M%DT%h%m%s.%u%Z%z
            "2023W515T13",                      // %VW%W%wT%h
            "2023W515T13,9",                    // %VW%W%wT%,1h
            "2023W515T13.9",                    // %VW%W%wT%.1h
            "2023W515T1358",                    // %VW%W%wT%h%m
            "2023W515T1358,4",                  // %VW%W%wT%h%,1m
            "2023W515T1358.4",                  // %VW%W%wT%h%.1m
            "2023W515T135826",                  // %VW%W%wT%h%m%s
            "2023W515T135826.9",                // %VW%W%wT%h%m%.1s
            "2023W515T135826.95",               // %VW%W%wT%h%m%.2s
            "2023W515T135826,950",              // %VW%W%wT%h%m%,3s
            "2023W515T135826.950",              // %VW%W%wT%h%m%.3s
            "2023W515T135826,950086",           // %VW%W%wT%h%m%s,%u
            "2023W515T135826.950086",           // %VW%W%wT%h%m%s.%u
            "2023W515T12Z",                     // %VW%W%wT%hZ
            "2023W515T12,9Z",                   // %VW%W%wT%,1hZ
            "2023W515T12.9Z",                   // %VW%W%wT%.1hZ
            "2023W515T1258Z",                   // %VW%W%wT%h%mZ
            "2023W515T1258,4Z",                 // %VW%W%wT%h%,1mZ
            "2023W515T1258.4Z",                 // %VW%W%wT%h%.1mZ
            "2023W515T125826Z",                 // %VW%W%wT%h%m%sZ
            "2023W515T125826.9Z",               // %VW%W%wT%h%m%.1sZ
            "2023W515T125826.95Z",              // %VW%W%wT%h%m%.2sZ
            "2023W515T125826,950Z",             // %VW%W%wT%h%m%,3sZ
            "2023W515T125826.950Z",             // %VW%W%wT%h%m%.3sZ
            "2023W515T125826,950086Z",          // %VW%W%wT%h%m%s,%uZ
            "2023W515T125826.950086Z",          // %VW%W%wT%h%m%s.%uZ
            "2023W515T13+01",                   // %VW%W%wT%h%Z
            "2023W515T13,9+01",                 // %VW%W%wT%,1h%Z
            "2023W515T13.9+01",                 // %VW%W%wT%.1h%Z
            "2023W515T1358+01",                 // %VW%W%wT%h%m%Z
            "2023W515T1358,4+01",               // %VW%W%wT%h%,1m%Z
            "2023W515T1358.4+01",               // %VW%W%wT%h%.1m%Z
            "2023W515T135826+01",               // %VW%W%wT%h%m%s%Z
            "2023W515T135826.9+01",             // %VW%W%wT%h%m%.1s%Z
            "2023W515T135826.95+01",            // %VW%W%wT%h%m%.2s%Z
            "2023W515T135826,950+01",           // %VW%W%wT%h%m%,3s%Z
            "2023W515T135826.950+01",           // %VW%W%wT%h%m%.3s%Z
            "2023W515T135826,950086+01",        // %VW%W%wT%h%m%s,%u%Z
            "2023W515T135826.950086+01",        // %VW%W%wT%h%m%s.%u%Z
            "2023W515T13+0100",                 // %VW%W%wT%h%Z%z
            "2023W515T13,9+0100",               // %VW%W%wT%,1h%Z%z
            "2023W515T13.9+0100",               // %VW%W%wT%.1h%Z%z
            "2023W515T1358+0100",               // %VW%W%wT%h%m%Z%z
            "2023W515T1358,4+0100",             // %VW%W%wT%h%,1m%Z%z
            "2023W515T1358.4+0100",             // %VW%W%wT%h%.1m%Z%z
            "2023W515T135826+0100",             // %VW%W%wT%h%m%s%Z%z
            "2023W515T135826.9+0100",           // %VW%W%wT%h%m%.1s%Z%z
            "2023W515T135826.95+0100",          // %VW%W%wT%h%m%.2s%Z%z
            "2023W515T135826,950+0100",         // %VW%W%wT%h%m%,3s%Z%z
            "2023W515T135826.950+0100",         // %VW%W%wT%h%m%.3s%Z%z
            "2023W515T135826,950086+0100",      // %VW%W%wT%h%m%s,%u%Z%z
            "2023W515T135826.950086+0100",      // %VW%W%wT%h%m%s.%u%Z%z
            "2023356T13",                       // %Y%OT%h
            "2023356T13,9",                     // %Y%OT%,1h
            "2023356T13.9",                     // %Y%OT%.1h
            "2023356T1358",                     // %Y%OT%h%m
            "2023356T1358,4",                   // %Y%OT%h%,1m
            "2023356T1358.4",                   // %Y%OT%h%.1m
            "2023356T135826",                   // %Y%OT%h%m%s
            "2023356T135826.9",                 // %Y%OT%h%m%.1s
            "2023356T135826.95",                // %Y%OT%h%m%.2s
            "2023356T135826,950",               // %Y%OT%h%m%,3s
            "2023356T135826.950",               // %Y%OT%h%m%.3s
            "2023356T135826,950086",            // %Y%OT%h%m%s,%u
            "2023356T135826.950086",            // %Y%OT%h%m%s.%u
            "2023356T12Z",                      // %Y%OT%hZ
            "2023356T12,9Z",                    // %Y%OT%,1hZ
            "2023356T12.9Z",                    // %Y%OT%.1hZ
            "2023356T1258Z",                    // %Y%OT%h%mZ
            "2023356T1258,4Z",                  // %Y%OT%h%,1mZ
            "2023356T1258.4Z",                  // %Y%OT%h%.1mZ
            "2023356T125826Z",                  // %Y%OT%h%m%sZ
            "2023356T125826.9Z",                // %Y%OT%h%m%.1sZ
            "2023356T125826.95Z",               // %Y%OT%h%m%.2sZ
            "2023356T125826,950Z",              // %Y%OT%h%m%,3sZ
            "2023356T125826.950Z",              // %Y%OT%h%m%.3sZ
            "2023356T125826,950086Z",           // %Y%OT%h%m%s,%uZ
            "2023356T125826.950086Z",           // %Y%OT%h%m%s.%uZ
            "2023356T13+01",                    // %Y%OT%h%Z
            "2023356T13,9+01",                  // %Y%OT%,1h%Z
            "2023356T13.9+01",                  // %Y%OT%.1h%Z
            "2023356T1358+01",                  // %Y%OT%h%m%Z
            "2023356T1358,4+01",                // %Y%OT%h%,1m%Z
            "2023356T1358.4+01",                // %Y%OT%h%.1m%Z
            "2023356T135826+01",                // %Y%OT%h%m%s%Z
            "2023356T135826.9+01",              // %Y%OT%h%m%.1s%Z
            "2023356T135826.95+01",             // %Y%OT%h%m%.2s%Z
            "2023356T135826,950+01",            // %Y%OT%h%m%,3s%Z
            "2023356T135826.950+01",            // %Y%OT%h%m%.3s%Z
            "2023356T135826,950086+01",         // %Y%OT%h%m%s,%u%Z
            "2023356T135826.950086+01",         // %Y%OT%h%m%s.%u%Z
            "2023356T13+0100",                  // %Y%OT%h%Z%z
            "2023356T13,9+0100",                // %Y%OT%,1h%Z%z
            "2023356T13.9+0100",                // %Y%OT%.1h%Z%z
            "2023356T1358+0100",                // %Y%OT%h%m%Z%z
            "2023356T1358,4+0100",              // %Y%OT%h%,1m%Z%z
            "2023356T1358.4+0100",              // %Y%OT%h%.1m%Z%z
            "2023356T135826+0100",              // %Y%OT%h%m%s%Z%z
            "2023356T135826.9+0100",            // %Y%OT%h%m%.1s%Z%z
            "2023356T135826.95+0100",           // %Y%OT%h%m%.2s%Z%z
            "2023356T135826,950+0100",          // %Y%OT%h%m%,3s%Z%z
            "2023356T135826.950+0100",          // %Y%OT%h%m%.3s%Z%z
            "2023356T135826,950086+0100",       // %Y%OT%h%m%s,%u%Z%z
            "2023356T135826.950086+0100",       // %Y%OT%h%m%s.%u%Z%z
            "2023-12-22T20:58:26+08",           // %Y-%M-%DT%h:%m:%s+08
            "2023-12-22T00-12",                 // %Y-%M-%DT%h-12
            "2023-12-22T00-12:00",              // %Y-%M-%DT%h-12:00
            "2023-12-22T00:58-12",              // %Y-%M-%DT%h:%m-12
            "2023-12-22T00:58-12:00",           // %Y-%M-%DT%h:%m-12:00
            "2023-12-22 13:58",                 // %Y-%M-%D %h:%m
            "2023-12-22 13:58:26",              // %Y-%M-%D %h:%m:%s
            "2023-12-22 13:58:26.9",            // %Y-%M-%D %h:%m:%.1s
            "2023-12-22 13:58:26.95",           // %Y-%M-%D %h:%m:%.2s
            "2023-12-22 13:58:26.950",          // %Y-%M-%D %h:%m:%.3s
            "2023-12-22 12:58Z",                // %Y-%M-%D %h:%mZ
            "2023-12-22 13:58+01:00",           // %Y-%M-%D %h:%m%Z:%z
            "2023-12-22T13:58+0100",            // %Y-%M-%DT%h:%m%Z%z
            "2023-12-22T13:58:26+0100",         // %Y-%M-%DT%h:%m:%s%Z%z
            "2023-12-22T13:58:26.9+0100",       // %Y-%M-%DT%h:%m:%.1s%Z%z
            "2023-12-22T13:58:26.95+0100",      // %Y-%M-%DT%h:%m:%.2s%Z%z
            "2023-12-22T13:58:26.950+0100",     // %Y-%M-%DT%h:%m:%.3s%Z%z
            "2023-12-22 13:58+0100",            // %Y-%M-%D %h:%m%Z%z
            "2023-12-22 13:58:26+0100",         // %Y-%M-%D %h:%m:%s%Z%z
            "2023-12-22 13:58:26.9+0100",       // %Y-%M-%D %h:%m:%.1s%Z%z
            "2023-12-22 13:58:26.95+0100",      // %Y-%M-%D %h:%m:%.2s%Z%z
            "2023-12-22 13:58:26.950+0100",     // %Y-%M-%D %h:%m:%.3s%Z%z
            "2023-12-22T21:43:26+0845",         // %Y-%M-%DT%h:%m:%s+0845
            "2023-12-22T12:58:26+0000",         // %Y-%M-%DT%h:%m:%s+0000
            "2023-12-22T13:00:58.950+0000",     // %Y-%M-%DT%h:%m:%.3s+0000
        ];

        let url_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/date-time/v/1",
            "title": "Date Time",
            "type": "string",
            "format": "date-time",
        }))
        .expect("failed to serialize date time type");

        let mut failed_formats = Vec::new();
        for format in VALID_FORMATS {
            if validate_data(json!(format), &url_type, ValidationProfile::Full)
                .await
                .is_err()
            {
                failed_formats.push(format);
            }
        }
        assert!(
            failed_formats.is_empty(),
            "failed to validate formats: {failed_formats:#?}"
        );

        _ = validate_data(json!(""), &url_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");

        let mut passed_formats = Vec::new();
        for format in INVALID_FORMATS {
            if validate_data(json!(format), &url_type, ValidationProfile::Full)
                .await
                .is_ok()
            {
                passed_formats.push(format);
            }
        }
        assert!(
            passed_formats.is_empty(),
            "passed invalid formats: {passed_formats:#?}"
        );
    }

    #[tokio::test]
    async fn date() {
        const VALID_FORMATS: &[&str] = &[
            "2023-12-22", // %Y-%M-%D
        ];

        const INVALID_FORMATS: &[&str] = &[
            "20",         // %C
            "202",        // %X
            "2023",       // %Y
            "2023-12",    // %Y-%M
            "2023-356",   // %Y-%O
            "2023-W51",   // %V-W%W
            "2023-W51-5", // %V-W%W-%w
            "20231222",   // %Y%M%D
            "2023356",    // %Y%O
            "2023W51",    // %VW%W
            "2023W515",   // %VW%W%w
            "--12-22",    // --%M-%D
            "12-22",      // %M-%D
        ];

        let url_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/date/v/1",
            "title": "Date",
            "type": "string",
            "format": "date",
        }))
        .expect("failed to serialize date type");

        let mut failed_formats = Vec::new();
        for format in VALID_FORMATS {
            if validate_data(json!(format), &url_type, ValidationProfile::Full)
                .await
                .is_err()
            {
                failed_formats.push(format);
            }
        }
        assert!(
            failed_formats.is_empty(),
            "failed to validate formats: {failed_formats:#?}"
        );

        _ = validate_data(json!(""), &url_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");

        let mut passed_formats = Vec::new();
        for format in INVALID_FORMATS {
            if validate_data(json!(format), &url_type, ValidationProfile::Full)
                .await
                .is_ok()
            {
                passed_formats.push(format);
            }
        }
        assert!(
            passed_formats.is_empty(),
            "passed invalid formats: {passed_formats:#?}"
        );
    }

    #[tokio::test]
    #[ignore]
    #[expect(clippy::too_many_lines, reason = "Most lines are just test data")]
    async fn time() {
        const VALID_FORMATS: &[&str] = &[
            "14:26:28+01:00",        // %h:%m:%s%Z:%z
            "14:26:28.9+01:00",      // %h:%m:%.1s%Z:%z
            "14:26:28.95+01:00",     // %h:%m:%.2s%Z:%z
            "14:26:28.950+01:00",    // %h:%m:%.3s%Z:%z
            "14:26:28.950086+01:00", // %h:%m:%s.%u%Z:%z
            "13:26:28Z",             // %h:%m:%sZ
            "13:26:28.9Z",           // %h:%m:%.1sZ
            "13:26:28.95Z",          // %h:%m:%.2sZ
            "13:26:28.950Z",         // %h:%m:%.3sZ
            "13:26:28.950086Z",      // %h:%m:%s.%uZ
            "13:26:28+00:00",        // %h:%m:%s+00:00
            "13:26:28.9+00:00",      // %h:%m:%.1s+00:00
            "13:26:28.950+00:00",    // %h:%m:%.3s+00:00
            "13:26:28.950086+00:00", // %h:%m:%s.%u+00:00
            "13:26:28-00:00",        // %h:%m:%s-00:00
            "13:26:28.9-00:00",      // %h:%m:%.1s-00:00
            "13:26:28.950-00:00",    // %h:%m:%.3s-00:00
            "13:26:28.950086-00:00", // %h:%m:%s.%u-00:00
        ];

        const INVALID_FORMATS: &[&str] = &[
            "14",                     // %h
            "14,4",                   // %,1h
            "14.4",                   // %.1h
            "14:26",                  // %h:%m
            "14:26,4",                // %h:%,1m
            "14:26.4",                // %h:%.1m
            "14:26:28",               // %h:%m:%s
            "14:26:28.9",             // %h:%m:%.1s
            "14:26:28.95",            // %h:%m:%.2s
            "14:26:28,950",           // %h:%m:%,3s
            "14:26:28.950",           // %h:%m:%.3s
            "14:26:28,950086",        // %h:%m:%s,%u
            "14:26:28.950086",        // %h:%m:%s.%u
            "13Z",                    // %hZ
            "13,4Z",                  // %,1hZ
            "13.4Z",                  // %.1hZ
            "13:26Z",                 // %h:%mZ
            "13:26,4Z",               // %h:%,1mZ
            "13:26.4Z",               // %h:%.1mZ
            "13:26:28,950Z",          // %h:%m:%,3sZ
            "13:26:28,950086Z",       // %h:%m:%s,%uZ
            "14+01",                  // %h%Z
            "14,4+01",                // %,1h%Z
            "14.4+01",                // %.1h%Z
            "14:26+01",               // %h:%m%Z
            "14:26,4+01",             // %h:%,1m%Z
            "14:26.4+01",             // %h:%.1m%Z
            "14:26:28+01",            // %h:%m:%s%Z
            "14:26:28.9+01",          // %h:%m:%.1s%Z
            "14:26:28.95+01",         // %h:%m:%.2s%Z
            "14:26:28,950+01",        // %h:%m:%,3s%Z
            "14:26:28.950+01",        // %h:%m:%.3s%Z
            "14:26:28,950086+01",     // %h:%m:%s,%u%Z
            "14:26:28.950086+01",     // %h:%m:%s.%u%Z
            "14+01:00",               // %h%Z:%z
            "14,4+01:00",             // %,1h%Z:%z
            "14.4+01:00",             // %.1h%Z:%z
            "14:26+01:00",            // %h:%m%Z:%z
            "14:26,4+01:00",          // %h:%,1m%Z:%z
            "14:26.4+01:00",          // %h:%.1m%Z:%z
            "14:26:28,950+01:00",     // %h:%m:%,3s%Z:%z
            "14:26:28,950086+01:00",  // %h:%m:%s,%u%Z:%z
            "T14",                    // T%h
            "T14,4",                  // T%,1h
            "T14.4",                  // T%.1h
            "T14:26",                 // T%h:%m
            "T14:26,4",               // T%h:%,1m
            "T14:26.4",               // T%h:%.1m
            "T14:26:28",              // T%h:%m:%s
            "T14:26:28.9",            // T%h:%m:%.1s
            "T14:26:28.95",           // T%h:%m:%.2s
            "T14:26:28,950",          // T%h:%m:%,3s
            "T14:26:28.950",          // T%h:%m:%.3s
            "T14:26:28,950086",       // T%h:%m:%s,%u
            "T14:26:28.950086",       // T%h:%m:%s.%u
            "T13Z",                   // T%hZ
            "T13,4Z",                 // T%,1hZ
            "T13.4Z",                 // T%.1hZ
            "T13:26Z",                // T%h:%mZ
            "T13:26,4Z",              // T%h:%,1mZ
            "T13:26.4Z",              // T%h:%.1mZ
            "T13:26:28Z",             // T%h:%m:%sZ
            "T13:26:28.9Z",           // T%h:%m:%.1sZ
            "T13:26:28.95Z",          // T%h:%m:%.2sZ
            "T13:26:28,950Z",         // T%h:%m:%,3sZ
            "T13:26:28.950Z",         // T%h:%m:%.3sZ
            "T13:26:28,950086Z",      // T%h:%m:%s,%uZ
            "T13:26:28.950086Z",      // T%h:%m:%s.%uZ
            "T14+01",                 // T%h%Z
            "T14,4+01",               // T%,1h%Z
            "T14.4+01",               // T%.1h%Z
            "T14:26+01",              // T%h:%m%Z
            "T14:26,4+01",            // T%h:%,1m%Z
            "T14:26.4+01",            // T%h:%.1m%Z
            "T14:26:28+01",           // T%h:%m:%s%Z
            "T14:26:28.9+01",         // T%h:%m:%.1s%Z
            "T14:26:28.95+01",        // T%h:%m:%.2s%Z
            "T14:26:28,950+01",       // T%h:%m:%,3s%Z
            "T14:26:28.950+01",       // T%h:%m:%.3s%Z
            "T14:26:28,950086+01",    // T%h:%m:%s,%u%Z
            "T14:26:28.950086+01",    // T%h:%m:%s.%u%Z
            "T14+01:00",              // T%h%Z:%z
            "T14,4+01:00",            // T%,1h%Z:%z
            "T14.4+01:00",            // T%.1h%Z:%z
            "T14:26+01:00",           // T%h:%m%Z:%z
            "T14:26,4+01:00",         // T%h:%,1m%Z:%z
            "T14:26.4+01:00",         // T%h:%.1m%Z:%z
            "T14:26:28+01:00",        // T%h:%m:%s%Z:%z
            "T14:26:28.9+01:00",      // T%h:%m:%.1s%Z:%z
            "T14:26:28.95+01:00",     // T%h:%m:%.2s%Z:%z
            "T14:26:28,950+01:00",    // T%h:%m:%,3s%Z:%z
            "T14:26:28.950+01:00",    // T%h:%m:%.3s%Z:%z
            "T14:26:28,950086+01:00", // T%h:%m:%s,%u%Z:%z
            "T14:26:28.950086+01:00", // T%h:%m:%s.%u%Z:%z
            "1426",                   // %h%m
            "1426,4",                 // %h%,1m
            "1426.4",                 // %h%.1m
            "142628",                 // %h%m%s
            "142628.9",               // %h%m%.1s
            "142628.95",              // %h%m%.2s
            "142628,950",             // %h%m%,3s
            "142628.950",             // %h%m%.3s
            "142628,950086",          // %h%m%s,%u
            "142628.950086",          // %h%m%s.%u
            "1326Z",                  // %h%mZ
            "1326,4Z",                // %h%,1mZ
            "1326.4Z",                // %h%.1mZ
            "132628Z",                // %h%m%sZ
            "132628.9Z",              // %h%m%.1sZ
            "132628.95Z",             // %h%m%.2sZ
            "132628,950Z",            // %h%m%,3sZ
            "132628.950Z",            // %h%m%.3sZ
            "132628,950086Z",         // %h%m%s,%uZ
            "132628.950086Z",         // %h%m%s.%uZ
            "1426+01",                // %h%m%Z
            "1426,4+01",              // %h%,1m%Z
            "1426.4+01",              // %h%.1m%Z
            "142628+01",              // %h%m%s%Z
            "142628.9+01",            // %h%m%.1s%Z
            "142628.95+01",           // %h%m%.2s%Z
            "142628,950+01",          // %h%m%,3s%Z
            "142628.950+01",          // %h%m%.3s%Z
            "142628,950086+01",       // %h%m%s,%u%Z
            "142628.950086+01",       // %h%m%s.%u%Z
            "14+0100",                // %h%Z%z
            "14,4+0100",              // %,1h%Z%z
            "14.4+0100",              // %.1h%Z%z
            "1426+0100",              // %h%m%Z%z
            "1426,4+0100",            // %h%,1m%Z%z
            "1426.4+0100",            // %h%.1m%Z%z
            "142628+0100",            // %h%m%s%Z%z
            "142628.9+0100",          // %h%m%.1s%Z%z
            "142628.95+0100",         // %h%m%.2s%Z%z
            "142628,950+0100",        // %h%m%,3s%Z%z
            "142628.950+0100",        // %h%m%.3s%Z%z
            "142628,950086+0100",     // %h%m%s,%u%Z%z
            "142628.950086+0100",     // %h%m%s.%u%Z%z
            "T1426",                  // T%h%m
            "T1426,4",                // T%h%,1m
            "T1426.4",                // T%h%.1m
            "T142628",                // T%h%m%s
            "T142628.9",              // T%h%m%.1s
            "T142628.95",             // T%h%m%.2s
            "T142628,950",            // T%h%m%,3s
            "T142628.950",            // T%h%m%.3s
            "T142628,950086",         // T%h%m%s,%u
            "T142628.950086",         // T%h%m%s.%u
            "T1326Z",                 // T%h%mZ
            "T1326,4Z",               // T%h%,1mZ
            "T1326.4Z",               // T%h%.1mZ
            "T132628Z",               // T%h%m%sZ
            "T132628.9Z",             // T%h%m%.1sZ
            "T132628.95Z",            // T%h%m%.2sZ
            "T132628,950Z",           // T%h%m%,3sZ
            "T132628.950Z",           // T%h%m%.3sZ
            "T132628,950086Z",        // T%h%m%s,%uZ
            "T132628.950086Z",        // T%h%m%s.%uZ
            "T1426+01",               // T%h%m%Z
            "T1426,4+01",             // T%h%,1m%Z
            "T1426.4+01",             // T%h%.1m%Z
            "T142628+01",             // T%h%m%s%Z
            "T142628.9+01",           // T%h%m%.1s%Z
            "T142628.95+01",          // T%h%m%.2s%Z
            "T142628,950+01",         // T%h%m%,3s%Z
            "T142628.950+01",         // T%h%m%.3s%Z
            "T142628,950086+01",      // T%h%m%s,%u%Z
            "T142628.950086+01",      // T%h%m%s.%u%Z
            "T14+0100",               // T%h%Z%z
            "T14,4+0100",             // T%,1h%Z%z
            "T14.4+0100",             // T%.1h%Z%z
            "T1426+0100",             // T%h%m%Z%z
            "T1426,4+0100",           // T%h%,1m%Z%z
            "T1426.4+0100",           // T%h%.1m%Z%z
            "T142628+0100",           // T%h%m%s%Z%z
            "T142628.9+0100",         // T%h%m%.1s%Z%z
            "T142628.95+0100",        // T%h%m%.2s%Z%z
            "T142628,950+0100",       // T%h%m%,3s%Z%z
            "T142628.950+0100",       // T%h%m%.3s%Z%z
            "T142628,950086+0100",    // T%h%m%s,%u%Z%z
            "T142628.950086+0100",    // T%h%m%s.%u%Z%z
        ];

        let url_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/time/v/1",
            "title": "Time",
            "type": "string",
            "format": "time",
        }))
        .expect("failed to serialize time type");

        let mut failed_formats = Vec::new();
        for format in VALID_FORMATS {
            if validate_data(json!(format), &url_type, ValidationProfile::Full)
                .await
                .is_err()
            {
                failed_formats.push(format);
            }
        }
        assert!(
            failed_formats.is_empty(),
            "failed to validate formats: {failed_formats:#?}"
        );

        _ = validate_data(json!(""), &url_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");

        let mut passed_formats = Vec::new();
        for format in INVALID_FORMATS {
            if validate_data(json!(format), &url_type, ValidationProfile::Full)
                .await
                .is_ok()
            {
                passed_formats.push(format);
            }
        }
        assert!(
            passed_formats.is_empty(),
            "passed invalid formats: {passed_formats:#?}"
        );
    }

    #[tokio::test]
    async fn duration() {
        // TODO: Allow durations which are allowed in ISO8601
        const VALID_FORMATS: &[&str] = &[
            "P1Y",
            // "P1,5Y",
            "P1.5Y",
            "P1M",
            "P1W",
            "P1D",
            "PT1H",
            // "P1H",
            "PT1M",
            "PT1S",
            // "P1S",
            // "PT1,5S",
            "PT1.5S",
            "P1Y1M",
            "P1Y1D",
            "P1Y1M1D",
            "P1Y1M1DT1H1M1S",
            "P1DT1H",
            "P1MT1M",
            "P1DT1M",
            "P1.5W",
            // "P1,5W",
            "P1DT1.000S",
            "P1DT1.00000S",
            "P1DT1H1M1.1S",
            // "P1H1M1.1S",
        ];
        const INVALID_FORMATS: &[&str] = &[
            "1W1M1S",
            "1S1M1H1W",
            "1 W",
            "1.5W",
            "1 D 1 W",
            "1.5 S 1.5 M",
            "1H 15 M",
        ];

        let url_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/duration/v/1",
            "title": "Duration",
            "type": "string",
            "format": "duration",
        }))
        .expect("failed to serialize duration type");

        let mut failed_formats = Vec::new();
        for format in VALID_FORMATS {
            if validate_data(json!(format), &url_type, ValidationProfile::Full)
                .await
                .is_err()
            {
                failed_formats.push(format);
            }
        }
        assert!(
            failed_formats.is_empty(),
            "failed to validate formats: {failed_formats:#?}"
        );

        _ = validate_data(json!(""), &url_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");

        let mut passed_formats = Vec::new();
        for format in INVALID_FORMATS {
            if validate_data(json!(format), &url_type, ValidationProfile::Full)
                .await
                .is_ok()
            {
                passed_formats.push(format);
            }
        }
        assert!(
            passed_formats.is_empty(),
            "passed invalid formats: {passed_formats:#?}"
        );
    }
}
