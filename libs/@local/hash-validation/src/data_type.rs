use core::borrow::Borrow;
use std::{
    net::{Ipv4Addr, Ipv6Addr},
    str::FromStr,
    sync::OnceLock,
};

use email_address::EmailAddress;
use error_stack::{bail, ensure, Report, ResultExt};
use graph_types::knowledge::entity::Property;
use iso8601_duration::Duration;
use regex::Regex;
use serde_json::Value as JsonValue;
use thiserror::Error;
use type_system::{url::VersionedUrl, DataType, DataTypeReference, JsonSchemaValueType};
use url::Url;
use uuid::Uuid;

use crate::{
    error::{Actual, Expected},
    OntologyTypeProvider, Schema, Validate, ValidationProfile,
};

#[derive(Debug, Error)]
pub enum DataTypeConstraint {
    #[error("the provided value is not equal to the expected value")]
    Const {
        actual: Property,
        expected: JsonValue,
    },
    #[error("the provided value is not one of the expected values")]
    Enum {
        actual: Property,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not greater than or equal to the minimum value, got `{actual}`, \
         expected `{expected}`"
    )]
    Minimum {
        actual: Property,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not less than or equal to the maximum value, got `{actual}`, \
         expected `{expected}`"
    )]
    Maximum {
        actual: Property,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not greater than the minimum value, got `{actual}`, expected \
         `{expected}`"
    )]
    ExclusiveMinimum {
        actual: Property,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not less than the maximum value, got `{actual}`, expected \
         `{expected}`"
    )]
    ExclusiveMaximum {
        actual: Property,
        expected: JsonValue,
    },
    #[error(
        "the provided value is not a multiple of the expected value, got `{actual}`, expected \
         `{expected}`"
    )]
    MultipleOf {
        actual: Property,
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
                        actual: Property::Value(value.clone()),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("maximum", Some(maximum)) => {
                ensure!(
                    number <= maximum,
                    Report::new(DataTypeConstraint::Maximum {
                        actual: Property::Value(value.clone()),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("exclusiveMinimum", Some(minimum)) => {
                ensure!(
                    number > minimum,
                    Report::new(DataTypeConstraint::ExclusiveMinimum {
                        actual: Property::Value(value.clone()),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("exclusiveMaximum", Some(maximum)) => {
                ensure!(
                    number < maximum,
                    Report::new(DataTypeConstraint::ExclusiveMaximum {
                        actual: Property::Value(value.clone()),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                );
            }
            ("multipleOf", Some(multiple)) => {
                ensure!(
                    multiple_of(&number, &multiple),
                    Report::new(DataTypeConstraint::MultipleOf {
                        actual: Property::Value(value.clone()),
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

#[expect(clippy::too_many_lines)]
fn check_format(value: &str, format: &str) -> Result<(), Report<DataValidationError>> {
    // Only the simplest date format are supported in all three, RFC-3339, ISO-8601 and HTML
    const DATE_REGEX_STRING: &str = r"(?P<Y>\d{4})-(?P<M>\d{2})-(?P<D>\d{2})";
    static DATE_REGEX: OnceLock<Regex> = OnceLock::new();

    // Only the simplest time format are supported in all three, RFC-3339, ISO-8601 and HTML
    const TIME_REGEX_STRING: &str =
        r"(?P<h>\d{2}):(?P<m>\d{2}):(?P<s>\d{2}(?:\.\d+)?)(?:(?P<Z>[+-]\d{2}):(?P<z>\d{2})|Z)";
    static TIME_REGEX: OnceLock<Regex> = OnceLock::new();

    static DATE_TIME_REGEX: OnceLock<Regex> = OnceLock::new();

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
            DATE_TIME_REGEX
                .get_or_init(|| {
                    Regex::new(&format!("^{DATE_REGEX_STRING}T{TIME_REGEX_STRING}$"))
                        .expect("failed to compile date-time regex")
                })
                .is_match(value)
                .then_some(())
                .ok_or_else(|| {
                    Report::new(DataTypeConstraint::Format {
                        actual: value.to_owned(),
                        format: "date-time",
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                })?;
        }
        "date" => {
            DATE_REGEX
                .get_or_init(|| {
                    Regex::new(&format!("^{DATE_REGEX_STRING}$"))
                        .expect("failed to compile date regex")
                })
                .is_match(value)
                .then_some(())
                .ok_or_else(|| {
                    Report::new(DataTypeConstraint::Format {
                        actual: value.to_owned(),
                        format: "date",
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                })?;
        }
        "time" => {
            TIME_REGEX
                .get_or_init(|| {
                    Regex::new(&format!("^{TIME_REGEX_STRING}$"))
                        .expect("failed to compile time regex")
                })
                .is_match(value)
                .then_some(())
                .ok_or_else(|| {
                    Report::new(DataTypeConstraint::Format {
                        actual: value.to_owned(),
                        format: "time",
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                })?;
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

impl<P: Sync> Schema<Property, P> for DataType {
    type Error = DataValidationError;

    async fn validate_value<'a>(
        &'a self,
        property: &'a Property,
        _: ValidationProfile,
        _: &'a P,
    ) -> Result<(), Report<DataValidationError>> {
        match (self.json_type(), property) {
            (JsonSchemaValueType::Number, Property::Value(value)) => {
                #[expect(clippy::float_arithmetic)]
                check_numeric_additional_property(
                    value,
                    self.additional_properties(),
                    JsonSchemaValueType::Number,
                    JsonValue::as_f64,
                    |number, multiple| number % multiple < f64::EPSILON,
                )?;
            }
            (JsonSchemaValueType::Integer, Property::Value(value)) => {
                check_numeric_additional_property(
                    value,
                    self.additional_properties(),
                    JsonSchemaValueType::Integer,
                    JsonValue::as_i64,
                    #[expect(clippy::integer_division_remainder_used)]
                    |number, multiple| number % multiple == 0,
                )?;
            }
            (JsonSchemaValueType::String, Property::Value(value)) => {
                check_string_additional_property(
                    value,
                    self.additional_properties(),
                    JsonSchemaValueType::String,
                    JsonValue::as_str,
                )?;
            }
            (expected, _) => ensure!(
                property.json_type() == expected,
                DataValidationError::InvalidType {
                    actual: property.json_type(),
                    expected,
                }
            ),
        }

        for (additional_key, additional_property) in self.additional_properties() {
            match additional_key.as_str() {
                "const" => ensure!(
                    property == additional_property,
                    Report::new(DataTypeConstraint::Const {
                        actual: property.clone(),
                        expected: additional_property.clone(),
                    })
                    .change_context(DataValidationError::ConstraintUnfulfilled)
                ),
                "enum" => {
                    ensure!(
                        additional_property
                            .as_array()
                            .is_some_and(|array| array.iter().any(|expected| property == expected)),
                        Report::new(DataTypeConstraint::Enum {
                            actual: property.clone(),
                            expected: additional_property.clone(),
                        })
                        .change_context(DataValidationError::ConstraintUnfulfilled)
                    );
                }
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                    if self.json_type() == JsonSchemaValueType::Integer
                        || self.json_type() == JsonSchemaValueType::Number => {}
                "format" | "minLength" | "maxLength" | "pattern"
                    if self.json_type() == JsonSchemaValueType::String => {}
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

impl Validate<DataType, ()> for Property {
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

impl<P> Schema<Property, P> for DataTypeReference
where
    P: OntologyTypeProvider<DataType> + Sync,
{
    type Error = DataValidationError;

    async fn validate_value<'a>(
        &'a self,
        value: &'a Property,
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
            .attach_lazy(|| Actual::Property(value.clone()))
    }
}

impl<P> Validate<DataTypeReference, P> for Property
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
    use uuid::Uuid;

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
    async fn integer() {
        let integer_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/integer/v/1",
            "title": "Integer",
            "type": "integer"
        }))
        .expect("failed to serialize temperature unit type");

        validate_data(json!(10), &integer_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!(-10), &integer_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        _ = validate_data(json!(1.0), &integer_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");

        _ = validate_data(
            json!(std::f64::consts::PI),
            &integer_type,
            ValidationProfile::Full,
        )
        .await
        .expect_err("validation succeeded");

        _ = validate_data(json!("foo"), &integer_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
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
        .expect("failed to serialize uri type");

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
    async fn uuid() {
        let uuid_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/uuid/v/1",
            "title": "UUID",
            "type": "string",
            "format": "uuid",
        }))
        .expect("failed to serialize uuid type");

        validate_data(json!(Uuid::nil()), &uuid_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(
            json!("00000000-0000-0000-0000-000000000000"),
            &uuid_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_data(
            json!("AC8E0011-84C3-4A7E-872D-1B9F86DB0479"),
            &uuid_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_data(
            json!("urn:uuid:cc2c0477-2fe7-4eb4-af7b-45bfe7d7bb26"),
            &uuid_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_data(
            json!("9544f491598e4c238f6bbb8c1f7d05c9"),
            &uuid_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_data(json!("10"), &uuid_type, ValidationProfile::Full)
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
        .expect("failed to serialize email type");

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
    async fn ipv4() {
        let ipv4_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/ipv4/v/1",
            "title": "IPv4",
            "type": "string",
            "format": "ipv4",
        }))
        .expect("failed to serialize ipv4 type");

        validate_data(json!("127.0.0.1"), &ipv4_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!("0.0.0.0"), &ipv4_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(
            json!("255.255.255.255"),
            &ipv4_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_data(
            json!("255.255.255.256"),
            &ipv4_type,
            ValidationProfile::Full,
        )
        .await
        .expect_err("validation succeeded");

        _ = validate_data(json!("localhost"), &ipv4_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn ipv6() {
        let ipv6_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/ipv6/v/1",
            "title": "IPv6",
            "type": "string",
            "format": "ipv6",
        }))
        .expect("failed to serialize ipv6 type");

        validate_data(json!("::1"), &ipv6_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!("::"), &ipv6_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(
            json!("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
            &ipv6_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_data(
            json!("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
            &ipv6_type,
            ValidationProfile::Full,
        )
        .await
        .expect_err("validation succeeded");

        _ = validate_data(json!("localhost"), &ipv6_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn hostname() {
        let hostname_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/hostname/v/1",
            "title": "Hostname",
            "type": "string",
            "format": "hostname",
        }))
        .expect("failed to serialize hostname type");

        validate_data(json!("localhost"), &hostname_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!("[::1]"), &hostname_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!("127.0.0.1"), &hostname_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(
            json!("example.com"),
            &hostname_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_data(
            json!("subdomain.example.com"),
            &hostname_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        validate_data(
            json!("subdomain.example.com."),
            &hostname_type,
            ValidationProfile::Full,
        )
        .await
        .expect("validation failed");

        _ = validate_data(
            json!("localhost:3000"),
            &hostname_type,
            ValidationProfile::Full,
        )
        .await
        .expect_err("validation succeeded");

        _ = validate_data(json!("::1"), &hostname_type, ValidationProfile::Full)
            .await
            .expect_err("validation succeeded");
    }

    #[tokio::test]
    async fn regex() {
        let regex_type = serde_json::to_string(&json!({
            "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            "kind": "dataType",
            "$id": "https://localhost:4000/@alice/types/data-type/regex/v/1",
            "title": "Regex",
            "type": "string",
            "format": "regex",
        }))
        .expect("failed to serialize regex type");

        validate_data(json!("^a*$"), &regex_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        validate_data(json!("^a+$"), &regex_type, ValidationProfile::Full)
            .await
            .expect("validation failed");

        _ = validate_data(json!("("), &regex_type, ValidationProfile::Full)
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
        const VALID_FORMATS: &[&str] = &[
            "2023-12-22T17:48:15Z",             // %Y-%M-%DT%h:%m:%sZ
            "2023-12-22T17:48:15.0Z",           // %Y-%M-%DT%h:%m:%.1sZ
            "2023-12-22T17:48:15.08Z",          // %Y-%M-%DT%h:%m:%.2sZ
            "2023-12-22T17:48:15.083Z",         // %Y-%M-%DT%h:%m:%.3sZ
            "2023-12-22T17:48:15.083212Z",      // %Y-%M-%DT%h:%m:%s.%uZ
            "2023-12-22T18:48:15.083212+01:00", // %Y-%M-%DT%h:%m:%s.%u%Z:%z
            "2023-12-22T18:48:15+01:00",        // %Y-%M-%DT%h:%m:%s%Z:%z
            "2023-12-22T18:48:15.083+01:00",    // %Y-%M-%DT%h:%m:%.3s%Z:%z
            "2023-12-23T02:33:15+08:45",        // %Y-%M-%DT%h:%m:%s+08:45
            "2023-12-22T17:48:15+00:00",        // %Y-%M-%DT%h:%m:%s+00:00
            "2023-12-22T18:48:15.0+01:00",      // %Y-%M-%DT%h:%m:%.1s%Z:%z
            "2023-12-22T18:48:15.08+01:00",     // %Y-%M-%DT%h:%m:%.2s%Z:%z
            "2023-12-22T17:48:15.083+00:00",    // %Y-%M-%DT%h:%m:%.3s+00:00
            "2023-12-22T17:48:15-00:00",        // %Y-%M-%DT%h:%m:%s-00:00
            "2023-12-22T17:48:15.083-00:00",    // %Y-%M-%DT%h:%m:%.3s-00:00
        ];

        const INVALID_FORMATS: &[&str] = &[
            "2023-12-22t17:48:15z",             // %Y-%M-%Dt%h:%m:%sz
            "2023-12-22t17:48:15.083z",         // %Y-%M-%Dt%h:%m:%.3sz
            "2023-12-22 18:48:15+01:00",        // %Y-%M-%D %h:%m:%s%Z:%z
            "2023-12-22 18:48:15.0+01:00",      // %Y-%M-%D %h:%m:%.1s%Z:%z
            "2023-12-22 18:48:15.08+01:00",     // %Y-%M-%D %h:%m:%.2s%Z:%z
            "2023-12-22 18:48:15.083+01:00",    // %Y-%M-%D %h:%m:%.3s%Z:%z
            "2023-12-22 18:48:15.083212+01:00", // %Y-%M-%D %h:%m:%s.%u%Z:%z
            "2023-12-22 17:48:15Z",             // %Y-%M-%D %h:%m:%sZ
            "2023-12-22 17:48:15z",             // %Y-%M-%D %h:%m:%sz
            "2023-12-22 17:48:15.0Z",           // %Y-%M-%D %h:%m:%.1sZ
            "2023-12-22 17:48:15.08Z",          // %Y-%M-%D %h:%m:%.2sZ
            "2023-12-22 17:48:15.083Z",         // %Y-%M-%D %h:%m:%.3sZ
            "2023-12-22 17:48:15.083212Z",      // %Y-%M-%D %h:%m:%s.%uZ
            "2023-12-22 17:48:15.083z",         // %Y-%M-%D %h:%m:%.3sz
            "2023-12-22 17:48:15.083212z",      // %Y-%M-%D %h:%m:%s.%uz
            "2023-12-22 17:48:15-00:00",        // %Y-%M-%D %h:%m:%s-00:00
            "2023-12-22 17:48:15.083-00:00",    // %Y-%M-%D %h:%m:%.3s-00:00
            "2023-12-22_17:48:15Z",             // %Y-%M-%D_%h:%m:%sZ
            "2023-12-22_17:48:15z",             // %Y-%M-%D_%h:%m:%sz
            "2023-12-22_17:48:15.083Z",         // %Y-%M-%D_%h:%m:%.3sZ
            "2023-12-22_17:48:15.083212Z",      // %Y-%M-%D_%h:%m:%s.%uZ
            "2023-12-22_17:48:15.083z",         // %Y-%M-%D_%h:%m:%.3sz
            "2023-12-22_17:48:15.083212z",      // %Y-%M-%D_%h:%m:%s.%uz
            "2023-12-22T18",                    // %Y-%M-%DT%h
            "2023-12-22T18,8",                  // %Y-%M-%DT%,1h
            "2023-12-22T18.8",                  // %Y-%M-%DT%.1h
            "2023-12-22T18:48",                 // %Y-%M-%DT%h:%m
            "2023-12-22T18:48,2",               // %Y-%M-%DT%h:%,1m
            "2023-12-22T18:48.2",               // %Y-%M-%DT%h:%.1m
            "2023-12-22T18:48:15",              // %Y-%M-%DT%h:%m:%s
            "2023-12-22T18:48:15.0",            // %Y-%M-%DT%h:%m:%.1s
            "2023-12-22T18:48:15.08",           // %Y-%M-%DT%h:%m:%.2s
            "2023-12-22T18:48:15,083",          // %Y-%M-%DT%h:%m:%,3s
            "2023-12-22T18:48:15.083",          // %Y-%M-%DT%h:%m:%.3s
            "2023-12-22T18:48:15,083212",       // %Y-%M-%DT%h:%m:%s,%u
            "2023-12-22T18:48:15.083212",       // %Y-%M-%DT%h:%m:%s.%u
            "2023-12-22T17Z",                   // %Y-%M-%DT%hZ
            "2023-12-22T17,8Z",                 // %Y-%M-%DT%,1hZ
            "2023-12-22T17.8Z",                 // %Y-%M-%DT%.1hZ
            "2023-12-22T17:48Z",                // %Y-%M-%DT%h:%mZ
            "2023-12-22T17:48,2Z",              // %Y-%M-%DT%h:%,1mZ
            "2023-12-22T17:48.2Z",              // %Y-%M-%DT%h:%.1mZ
            "2023-12-22T17:48:15,083Z",         // %Y-%M-%DT%h:%m:%,3sZ
            "2023-12-22T17:48:15,083212Z",      // %Y-%M-%DT%h:%m:%s,%uZ
            "2023-12-22T18+01",                 // %Y-%M-%DT%h%Z
            "2023-12-22T18,8+01",               // %Y-%M-%DT%,1h%Z
            "2023-12-22T18.8+01",               // %Y-%M-%DT%.1h%Z
            "2023-12-22T18:48+01",              // %Y-%M-%DT%h:%m%Z
            "2023-12-22T18:48,2+01",            // %Y-%M-%DT%h:%,1m%Z
            "2023-12-22T18:48.2+01",            // %Y-%M-%DT%h:%.1m%Z
            "2023-12-22T18:48:15+01",           // %Y-%M-%DT%h:%m:%s%Z
            "2023-12-22T18:48:15.0+01",         // %Y-%M-%DT%h:%m:%.1s%Z
            "2023-12-22T18:48:15.08+01",        // %Y-%M-%DT%h:%m:%.2s%Z
            "2023-12-22T18:48:15,083+01",       // %Y-%M-%DT%h:%m:%,3s%Z
            "2023-12-22T18:48:15.083+01",       // %Y-%M-%DT%h:%m:%.3s%Z
            "2023-12-22T18:48:15,083212+01",    // %Y-%M-%DT%h:%m:%s,%u%Z
            "2023-12-22T18:48:15.083212+01",    // %Y-%M-%DT%h:%m:%s.%u%Z
            "2023-12-22T18+01:00",              // %Y-%M-%DT%h%Z:%z
            "2023-12-22T18,8+01:00",            // %Y-%M-%DT%,1h%Z:%z
            "2023-12-22T18.8+01:00",            // %Y-%M-%DT%.1h%Z:%z
            "2023-12-22T18:48+01:00",           // %Y-%M-%DT%h:%m%Z:%z
            "2023-12-22T18:48,2+01:00",         // %Y-%M-%DT%h:%,1m%Z:%z
            "2023-12-22T18:48.2+01:00",         // %Y-%M-%DT%h:%.1m%Z:%z
            "2023-12-22T18:48:15,083+01:00",    // %Y-%M-%DT%h:%m:%,3s%Z:%z
            "2023-12-22T18:48:15,083212+01:00", // %Y-%M-%DT%h:%m:%s,%u%Z:%z
            "2023-W51-5T18",                    // %V-W%W-%wT%h
            "2023-W51-5T18,8",                  // %V-W%W-%wT%,1h
            "2023-W51-5T18.8",                  // %V-W%W-%wT%.1h
            "2023-W51-5T18:48",                 // %V-W%W-%wT%h:%m
            "2023-W51-5T18:48,2",               // %V-W%W-%wT%h:%,1m
            "2023-W51-5T18:48.2",               // %V-W%W-%wT%h:%.1m
            "2023-W51-5T18:48:15",              // %V-W%W-%wT%h:%m:%s
            "2023-W51-5T18:48:15.0",            // %V-W%W-%wT%h:%m:%.1s
            "2023-W51-5T18:48:15.08",           // %V-W%W-%wT%h:%m:%.2s
            "2023-W51-5T18:48:15,083",          // %V-W%W-%wT%h:%m:%,3s
            "2023-W51-5T18:48:15.083",          // %V-W%W-%wT%h:%m:%.3s
            "2023-W51-5T18:48:15,083212",       // %V-W%W-%wT%h:%m:%s,%u
            "2023-W51-5T18:48:15.083212",       // %V-W%W-%wT%h:%m:%s.%u
            "2023-W51-5T17Z",                   // %V-W%W-%wT%hZ
            "2023-W51-5T17,8Z",                 // %V-W%W-%wT%,1hZ
            "2023-W51-5T17.8Z",                 // %V-W%W-%wT%.1hZ
            "2023-W51-5T17:48Z",                // %V-W%W-%wT%h:%mZ
            "2023-W51-5T17:48,2Z",              // %V-W%W-%wT%h:%,1mZ
            "2023-W51-5T17:48.2Z",              // %V-W%W-%wT%h:%.1mZ
            "2023-W51-5T17:48:15Z",             // %V-W%W-%wT%h:%m:%sZ
            "2023-W51-5T17:48:15.0Z",           // %V-W%W-%wT%h:%m:%.1sZ
            "2023-W51-5T17:48:15.08Z",          // %V-W%W-%wT%h:%m:%.2sZ
            "2023-W51-5T17:48:15,083Z",         // %V-W%W-%wT%h:%m:%,3sZ
            "2023-W51-5T17:48:15.083Z",         // %V-W%W-%wT%h:%m:%.3sZ
            "2023-W51-5T17:48:15,083212Z",      // %V-W%W-%wT%h:%m:%s,%uZ
            "2023-W51-5T17:48:15.083212Z",      // %V-W%W-%wT%h:%m:%s.%uZ
            "2023-W51-5T18+01",                 // %V-W%W-%wT%h%Z
            "2023-W51-5T18,8+01",               // %V-W%W-%wT%,1h%Z
            "2023-W51-5T18.8+01",               // %V-W%W-%wT%.1h%Z
            "2023-W51-5T18:48+01",              // %V-W%W-%wT%h:%m%Z
            "2023-W51-5T18:48,2+01",            // %V-W%W-%wT%h:%,1m%Z
            "2023-W51-5T18:48.2+01",            // %V-W%W-%wT%h:%.1m%Z
            "2023-W51-5T18:48:15+01",           // %V-W%W-%wT%h:%m:%s%Z
            "2023-W51-5T18:48:15.0+01",         // %V-W%W-%wT%h:%m:%.1s%Z
            "2023-W51-5T18:48:15.08+01",        // %V-W%W-%wT%h:%m:%.2s%Z
            "2023-W51-5T18:48:15,083+01",       // %V-W%W-%wT%h:%m:%,3s%Z
            "2023-W51-5T18:48:15.083+01",       // %V-W%W-%wT%h:%m:%.3s%Z
            "2023-W51-5T18:48:15,083212+01",    // %V-W%W-%wT%h:%m:%s,%u%Z
            "2023-W51-5T18:48:15.083212+01",    // %V-W%W-%wT%h:%m:%s.%u%Z
            "2023-W51-5T18+01:00",              // %V-W%W-%wT%h%Z:%z
            "2023-W51-5T18,8+01:00",            // %V-W%W-%wT%,1h%Z:%z
            "2023-W51-5T18.8+01:00",            // %V-W%W-%wT%.1h%Z:%z
            "2023-W51-5T18:48+01:00",           // %V-W%W-%wT%h:%m%Z:%z
            "2023-W51-5T18:48,2+01:00",         // %V-W%W-%wT%h:%,1m%Z:%z
            "2023-W51-5T18:48.2+01:00",         // %V-W%W-%wT%h:%.1m%Z:%z
            "2023-W51-5T18:48:15+01:00",        // %V-W%W-%wT%h:%m:%s%Z:%z
            "2023-W51-5T18:48:15.0+01:00",      // %V-W%W-%wT%h:%m:%.1s%Z:%z
            "2023-W51-5T18:48:15.08+01:00",     // %V-W%W-%wT%h:%m:%.2s%Z:%z
            "2023-W51-5T18:48:15,083+01:00",    // %V-W%W-%wT%h:%m:%,3s%Z:%z
            "2023-W51-5T18:48:15.083+01:00",    // %V-W%W-%wT%h:%m:%.3s%Z:%z
            "2023-W51-5T18:48:15,083212+01:00", // %V-W%W-%wT%h:%m:%s,%u%Z:%z
            "2023-W51-5T18:48:15.083212+01:00", // %V-W%W-%wT%h:%m:%s.%u%Z:%z
            "2023-356T18",                      // %Y-%OT%h
            "2023-356T18,8",                    // %Y-%OT%,1h
            "2023-356T18.8",                    // %Y-%OT%.1h
            "2023-356T18:48",                   // %Y-%OT%h:%m
            "2023-356T18:48,2",                 // %Y-%OT%h:%,1m
            "2023-356T18:48.2",                 // %Y-%OT%h:%.1m
            "2023-356T18:48:15",                // %Y-%OT%h:%m:%s
            "2023-356T18:48:15.0",              // %Y-%OT%h:%m:%.1s
            "2023-356T18:48:15.08",             // %Y-%OT%h:%m:%.2s
            "2023-356T18:48:15,083",            // %Y-%OT%h:%m:%,3s
            "2023-356T18:48:15.083",            // %Y-%OT%h:%m:%.3s
            "2023-356T18:48:15,083212",         // %Y-%OT%h:%m:%s,%u
            "2023-356T18:48:15.083212",         // %Y-%OT%h:%m:%s.%u
            "2023-356T17Z",                     // %Y-%OT%hZ
            "2023-356T17,8Z",                   // %Y-%OT%,1hZ
            "2023-356T17.8Z",                   // %Y-%OT%.1hZ
            "2023-356T17:48Z",                  // %Y-%OT%h:%mZ
            "2023-356T17:48,2Z",                // %Y-%OT%h:%,1mZ
            "2023-356T17:48.2Z",                // %Y-%OT%h:%.1mZ
            "2023-356T17:48:15Z",               // %Y-%OT%h:%m:%sZ
            "2023-356T17:48:15.0Z",             // %Y-%OT%h:%m:%.1sZ
            "2023-356T17:48:15.08Z",            // %Y-%OT%h:%m:%.2sZ
            "2023-356T17:48:15,083Z",           // %Y-%OT%h:%m:%,3sZ
            "2023-356T17:48:15.083Z",           // %Y-%OT%h:%m:%.3sZ
            "2023-356T17:48:15,083212Z",        // %Y-%OT%h:%m:%s,%uZ
            "2023-356T17:48:15.083212Z",        // %Y-%OT%h:%m:%s.%uZ
            "2023-356T18+01",                   // %Y-%OT%h%Z
            "2023-356T18,8+01",                 // %Y-%OT%,1h%Z
            "2023-356T18.8+01",                 // %Y-%OT%.1h%Z
            "2023-356T18:48+01",                // %Y-%OT%h:%m%Z
            "2023-356T18:48,2+01",              // %Y-%OT%h:%,1m%Z
            "2023-356T18:48.2+01",              // %Y-%OT%h:%.1m%Z
            "2023-356T18:48:15+01",             // %Y-%OT%h:%m:%s%Z
            "2023-356T18:48:15.0+01",           // %Y-%OT%h:%m:%.1s%Z
            "2023-356T18:48:15.08+01",          // %Y-%OT%h:%m:%.2s%Z
            "2023-356T18:48:15,083+01",         // %Y-%OT%h:%m:%,3s%Z
            "2023-356T18:48:15.083+01",         // %Y-%OT%h:%m:%.3s%Z
            "2023-356T18:48:15,083212+01",      // %Y-%OT%h:%m:%s,%u%Z
            "2023-356T18:48:15.083212+01",      // %Y-%OT%h:%m:%s.%u%Z
            "2023-356T18+01:00",                // %Y-%OT%h%Z:%z
            "2023-356T18,8+01:00",              // %Y-%OT%,1h%Z:%z
            "2023-356T18.8+01:00",              // %Y-%OT%.1h%Z:%z
            "2023-356T18:48+01:00",             // %Y-%OT%h:%m%Z:%z
            "2023-356T18:48,2+01:00",           // %Y-%OT%h:%,1m%Z:%z
            "2023-356T18:48.2+01:00",           // %Y-%OT%h:%.1m%Z:%z
            "2023-356T18:48:15+01:00",          // %Y-%OT%h:%m:%s%Z:%z
            "2023-356T18:48:15.0+01:00",        // %Y-%OT%h:%m:%.1s%Z:%z
            "2023-356T18:48:15.08+01:00",       // %Y-%OT%h:%m:%.2s%Z:%z
            "2023-356T18:48:15,083+01:00",      // %Y-%OT%h:%m:%,3s%Z:%z
            "2023-356T18:48:15.083+01:00",      // %Y-%OT%h:%m:%.3s%Z:%z
            "2023-356T18:48:15,083212+01:00",   // %Y-%OT%h:%m:%s,%u%Z:%z
            "2023-356T18:48:15.083212+01:00",   // %Y-%OT%h:%m:%s.%u%Z:%z
            "20231222T18",                      // %Y%M%DT%h
            "20231222T18,8",                    // %Y%M%DT%,1h
            "20231222T18.8",                    // %Y%M%DT%.1h
            "20231222T1848",                    // %Y%M%DT%h%m
            "20231222T1848,2",                  // %Y%M%DT%h%,1m
            "20231222T1848.2",                  // %Y%M%DT%h%.1m
            "20231222T184815",                  // %Y%M%DT%h%m%s
            "20231222T184815.0",                // %Y%M%DT%h%m%.1s
            "20231222T184815.08",               // %Y%M%DT%h%m%.2s
            "20231222T184815,083",              // %Y%M%DT%h%m%,3s
            "20231222T184815.083",              // %Y%M%DT%h%m%.3s
            "20231222T184815,083212",           // %Y%M%DT%h%m%s,%u
            "20231222T184815.083212",           // %Y%M%DT%h%m%s.%u
            "20231222T17Z",                     // %Y%M%DT%hZ
            "20231222T17,8Z",                   // %Y%M%DT%,1hZ
            "20231222T17.8Z",                   // %Y%M%DT%.1hZ
            "20231222T1748Z",                   // %Y%M%DT%h%mZ
            "20231222T1748,2Z",                 // %Y%M%DT%h%,1mZ
            "20231222T1748.2Z",                 // %Y%M%DT%h%.1mZ
            "20231222T174815Z",                 // %Y%M%DT%h%m%sZ
            "20231222T174815.0Z",               // %Y%M%DT%h%m%.1sZ
            "20231222T174815.08Z",              // %Y%M%DT%h%m%.2sZ
            "20231222T174815,083Z",             // %Y%M%DT%h%m%,3sZ
            "20231222T174815.083Z",             // %Y%M%DT%h%m%.3sZ
            "20231222T174815,083212Z",          // %Y%M%DT%h%m%s,%uZ
            "20231222T174815.083212Z",          // %Y%M%DT%h%m%s.%uZ
            "20231222T18+01",                   // %Y%M%DT%h%Z
            "20231222T18,8+01",                 // %Y%M%DT%,1h%Z
            "20231222T18.8+01",                 // %Y%M%DT%.1h%Z
            "20231222T1848+01",                 // %Y%M%DT%h%m%Z
            "20231222T1848,2+01",               // %Y%M%DT%h%,1m%Z
            "20231222T1848.2+01",               // %Y%M%DT%h%.1m%Z
            "20231222T184815+01",               // %Y%M%DT%h%m%s%Z
            "20231222T184815.0+01",             // %Y%M%DT%h%m%.1s%Z
            "20231222T184815.08+01",            // %Y%M%DT%h%m%.2s%Z
            "20231222T184815,083+01",           // %Y%M%DT%h%m%,3s%Z
            "20231222T184815.083+01",           // %Y%M%DT%h%m%.3s%Z
            "20231222T184815,083212+01",        // %Y%M%DT%h%m%s,%u%Z
            "20231222T184815.083212+01",        // %Y%M%DT%h%m%s.%u%Z
            "20231222T18+0100",                 // %Y%M%DT%h%Z%z
            "20231222T18,8+0100",               // %Y%M%DT%,1h%Z%z
            "20231222T18.8+0100",               // %Y%M%DT%.1h%Z%z
            "20231222T1848+0100",               // %Y%M%DT%h%m%Z%z
            "20231222T1848,2+0100",             // %Y%M%DT%h%,1m%Z%z
            "20231222T1848.2+0100",             // %Y%M%DT%h%.1m%Z%z
            "20231222T184815+0100",             // %Y%M%DT%h%m%s%Z%z
            "20231222T184815.0+0100",           // %Y%M%DT%h%m%.1s%Z%z
            "20231222T184815.08+0100",          // %Y%M%DT%h%m%.2s%Z%z
            "20231222T184815,083+0100",         // %Y%M%DT%h%m%,3s%Z%z
            "20231222T184815.083+0100",         // %Y%M%DT%h%m%.3s%Z%z
            "20231222T184815,083212+0100",      // %Y%M%DT%h%m%s,%u%Z%z
            "20231222T184815.083212+0100",      // %Y%M%DT%h%m%s.%u%Z%z
            "2023W515T18",                      // %VW%W%wT%h
            "2023W515T18,8",                    // %VW%W%wT%,1h
            "2023W515T18.8",                    // %VW%W%wT%.1h
            "2023W515T1848",                    // %VW%W%wT%h%m
            "2023W515T1848,2",                  // %VW%W%wT%h%,1m
            "2023W515T1848.2",                  // %VW%W%wT%h%.1m
            "2023W515T184815",                  // %VW%W%wT%h%m%s
            "2023W515T184815.0",                // %VW%W%wT%h%m%.1s
            "2023W515T184815.08",               // %VW%W%wT%h%m%.2s
            "2023W515T184815,083",              // %VW%W%wT%h%m%,3s
            "2023W515T184815.083",              // %VW%W%wT%h%m%.3s
            "2023W515T184815,083212",           // %VW%W%wT%h%m%s,%u
            "2023W515T184815.083212",           // %VW%W%wT%h%m%s.%u
            "2023W515T17Z",                     // %VW%W%wT%hZ
            "2023W515T17,8Z",                   // %VW%W%wT%,1hZ
            "2023W515T17.8Z",                   // %VW%W%wT%.1hZ
            "2023W515T1748Z",                   // %VW%W%wT%h%mZ
            "2023W515T1748,2Z",                 // %VW%W%wT%h%,1mZ
            "2023W515T1748.2Z",                 // %VW%W%wT%h%.1mZ
            "2023W515T174815Z",                 // %VW%W%wT%h%m%sZ
            "2023W515T174815.0Z",               // %VW%W%wT%h%m%.1sZ
            "2023W515T174815.08Z",              // %VW%W%wT%h%m%.2sZ
            "2023W515T174815,083Z",             // %VW%W%wT%h%m%,3sZ
            "2023W515T174815.083Z",             // %VW%W%wT%h%m%.3sZ
            "2023W515T174815,083212Z",          // %VW%W%wT%h%m%s,%uZ
            "2023W515T174815.083212Z",          // %VW%W%wT%h%m%s.%uZ
            "2023W515T18+01",                   // %VW%W%wT%h%Z
            "2023W515T18,8+01",                 // %VW%W%wT%,1h%Z
            "2023W515T18.8+01",                 // %VW%W%wT%.1h%Z
            "2023W515T1848+01",                 // %VW%W%wT%h%m%Z
            "2023W515T1848,2+01",               // %VW%W%wT%h%,1m%Z
            "2023W515T1848.2+01",               // %VW%W%wT%h%.1m%Z
            "2023W515T184815+01",               // %VW%W%wT%h%m%s%Z
            "2023W515T184815.0+01",             // %VW%W%wT%h%m%.1s%Z
            "2023W515T184815.08+01",            // %VW%W%wT%h%m%.2s%Z
            "2023W515T184815,083+01",           // %VW%W%wT%h%m%,3s%Z
            "2023W515T184815.083+01",           // %VW%W%wT%h%m%.3s%Z
            "2023W515T184815,083212+01",        // %VW%W%wT%h%m%s,%u%Z
            "2023W515T184815.083212+01",        // %VW%W%wT%h%m%s.%u%Z
            "2023W515T18+0100",                 // %VW%W%wT%h%Z%z
            "2023W515T18,8+0100",               // %VW%W%wT%,1h%Z%z
            "2023W515T18.8+0100",               // %VW%W%wT%.1h%Z%z
            "2023W515T1848+0100",               // %VW%W%wT%h%m%Z%z
            "2023W515T1848,2+0100",             // %VW%W%wT%h%,1m%Z%z
            "2023W515T1848.2+0100",             // %VW%W%wT%h%.1m%Z%z
            "2023W515T184815+0100",             // %VW%W%wT%h%m%s%Z%z
            "2023W515T184815.0+0100",           // %VW%W%wT%h%m%.1s%Z%z
            "2023W515T184815.08+0100",          // %VW%W%wT%h%m%.2s%Z%z
            "2023W515T184815,083+0100",         // %VW%W%wT%h%m%,3s%Z%z
            "2023W515T184815.083+0100",         // %VW%W%wT%h%m%.3s%Z%z
            "2023W515T184815,083212+0100",      // %VW%W%wT%h%m%s,%u%Z%z
            "2023W515T184815.083212+0100",      // %VW%W%wT%h%m%s.%u%Z%z
            "2023356T18",                       // %Y%OT%h
            "2023356T18,8",                     // %Y%OT%,1h
            "2023356T18.8",                     // %Y%OT%.1h
            "2023356T1848",                     // %Y%OT%h%m
            "2023356T1848,2",                   // %Y%OT%h%,1m
            "2023356T1848.2",                   // %Y%OT%h%.1m
            "2023356T184815",                   // %Y%OT%h%m%s
            "2023356T184815.0",                 // %Y%OT%h%m%.1s
            "2023356T184815.08",                // %Y%OT%h%m%.2s
            "2023356T184815,083",               // %Y%OT%h%m%,3s
            "2023356T184815.083",               // %Y%OT%h%m%.3s
            "2023356T184815,083212",            // %Y%OT%h%m%s,%u
            "2023356T184815.083212",            // %Y%OT%h%m%s.%u
            "2023356T17Z",                      // %Y%OT%hZ
            "2023356T17,8Z",                    // %Y%OT%,1hZ
            "2023356T17.8Z",                    // %Y%OT%.1hZ
            "2023356T1748Z",                    // %Y%OT%h%mZ
            "2023356T1748,2Z",                  // %Y%OT%h%,1mZ
            "2023356T1748.2Z",                  // %Y%OT%h%.1mZ
            "2023356T174815Z",                  // %Y%OT%h%m%sZ
            "2023356T174815.0Z",                // %Y%OT%h%m%.1sZ
            "2023356T174815.08Z",               // %Y%OT%h%m%.2sZ
            "2023356T174815,083Z",              // %Y%OT%h%m%,3sZ
            "2023356T174815.083Z",              // %Y%OT%h%m%.3sZ
            "2023356T174815,083212Z",           // %Y%OT%h%m%s,%uZ
            "2023356T174815.083212Z",           // %Y%OT%h%m%s.%uZ
            "2023356T18+01",                    // %Y%OT%h%Z
            "2023356T18,8+01",                  // %Y%OT%,1h%Z
            "2023356T18.8+01",                  // %Y%OT%.1h%Z
            "2023356T1848+01",                  // %Y%OT%h%m%Z
            "2023356T1848,2+01",                // %Y%OT%h%,1m%Z
            "2023356T1848.2+01",                // %Y%OT%h%.1m%Z
            "2023356T184815+01",                // %Y%OT%h%m%s%Z
            "2023356T184815.0+01",              // %Y%OT%h%m%.1s%Z
            "2023356T184815.08+01",             // %Y%OT%h%m%.2s%Z
            "2023356T184815,083+01",            // %Y%OT%h%m%,3s%Z
            "2023356T184815.083+01",            // %Y%OT%h%m%.3s%Z
            "2023356T184815,083212+01",         // %Y%OT%h%m%s,%u%Z
            "2023356T184815.083212+01",         // %Y%OT%h%m%s.%u%Z
            "2023356T18+0100",                  // %Y%OT%h%Z%z
            "2023356T18,8+0100",                // %Y%OT%,1h%Z%z
            "2023356T18.8+0100",                // %Y%OT%.1h%Z%z
            "2023356T1848+0100",                // %Y%OT%h%m%Z%z
            "2023356T1848,2+0100",              // %Y%OT%h%,1m%Z%z
            "2023356T1848.2+0100",              // %Y%OT%h%.1m%Z%z
            "2023356T184815+0100",              // %Y%OT%h%m%s%Z%z
            "2023356T184815.0+0100",            // %Y%OT%h%m%.1s%Z%z
            "2023356T184815.08+0100",           // %Y%OT%h%m%.2s%Z%z
            "2023356T184815,083+0100",          // %Y%OT%h%m%,3s%Z%z
            "2023356T184815.083+0100",          // %Y%OT%h%m%.3s%Z%z
            "2023356T184815,083212+0100",       // %Y%OT%h%m%s,%u%Z%z
            "2023356T184815.083212+0100",       // %Y%OT%h%m%s.%u%Z%z
            "2023-12-23T01:48:15+08",           // %Y-%M-%DT%h:%m:%s+08
            "2023-12-22T05-12",                 // %Y-%M-%DT%h-12
            "2023-12-22T05-12:00",              // %Y-%M-%DT%h-12:00
            "2023-12-22T05:48-12",              // %Y-%M-%DT%h:%m-12
            "2023-12-22T05:48-12:00",           // %Y-%M-%DT%h:%m-12:00
            "2023-12-22 18:48",                 // %Y-%M-%D %h:%m
            "2023-12-22 18:48:15",              // %Y-%M-%D %h:%m:%s
            "2023-12-22 18:48:15.0",            // %Y-%M-%D %h:%m:%.1s
            "2023-12-22 18:48:15.08",           // %Y-%M-%D %h:%m:%.2s
            "2023-12-22 18:48:15.083",          // %Y-%M-%D %h:%m:%.3s
            "2023-12-22 17:48Z",                // %Y-%M-%D %h:%mZ
            "2023-12-22 18:48+01:00",           // %Y-%M-%D %h:%m%Z:%z
            "2023-12-22T18:48+0100",            // %Y-%M-%DT%h:%m%Z%z
            "2023-12-22T18:48:15+0100",         // %Y-%M-%DT%h:%m:%s%Z%z
            "2023-12-22T18:48:15.0+0100",       // %Y-%M-%DT%h:%m:%.1s%Z%z
            "2023-12-22T18:48:15.08+0100",      // %Y-%M-%DT%h:%m:%.2s%Z%z
            "2023-12-22T18:48:15.083+0100",     // %Y-%M-%DT%h:%m:%.3s%Z%z
            "2023-12-22 18:48+0100",            // %Y-%M-%D %h:%m%Z%z
            "2023-12-22 18:48:15+0100",         // %Y-%M-%D %h:%m:%s%Z%z
            "2023-12-22 18:48:15.0+0100",       // %Y-%M-%D %h:%m:%.1s%Z%z
            "2023-12-22 18:48:15.08+0100",      // %Y-%M-%D %h:%m:%.2s%Z%z
            "2023-12-22 18:48:15.083+0100",     // %Y-%M-%D %h:%m:%.3s%Z%z
            "2023-12-23T02:33:15+0845",         // %Y-%M-%DT%h:%m:%s+0845
            "2023-12-22T17:48:15+0000",         // %Y-%M-%DT%h:%m:%s+0000
            "2023-12-22T17:48:15.083+0000",     // %Y-%M-%DT%h:%m:%.3s+0000
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
