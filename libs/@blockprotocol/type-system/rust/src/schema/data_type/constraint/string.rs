use core::{
    net::{AddrParseError, Ipv4Addr, Ipv6Addr},
    str::FromStr,
};
use std::{collections::HashSet, sync::OnceLock};

use email_address::EmailAddress;
use error_stack::{Report, ReportSink, ResultExt, TryReportIteratorExt as _, bail, ensure};
use iso8601_duration::{Duration, ParseDurationError};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value as JsonValue, json};
use thiserror::Error;
use url::{Host, Url};
use uuid::Uuid;

use crate::schema::{
    ConstraintError, JsonSchemaValueType, SingleValueConstraints,
    data_type::{
        closed::ResolveClosedDataTypeError,
        constraint::{Constraint, ConstraintValidator, ValueConstraints},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "kebab-case")]
pub enum StringFormat {
    Uri,
    Hostname,
    Ipv4,
    Ipv6,
    Uuid,
    Regex,
    Email,
    Date,
    Time,
    DateTime,
    Duration,
}

impl StringFormat {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Uri => "uri",
            Self::Hostname => "hostname",
            Self::Ipv4 => "ipv4",
            Self::Ipv6 => "ipv6",
            Self::Uuid => "uuid",
            Self::Regex => "regex",
            Self::Email => "email",
            Self::Date => "date",
            Self::Time => "time",
            Self::DateTime => "date-time",
            Self::Duration => "duration",
        }
    }
}

#[derive(Debug, Error)]
pub enum StringFormatError {
    #[error(transparent)]
    Url(url::ParseError),
    #[error(transparent)]
    Uuid(uuid::Error),
    #[error(transparent)]
    Regex(regex::Error),
    #[error(transparent)]
    Email(email_address::Error),
    #[error(transparent)]
    IpAddress(AddrParseError),
    #[error("The value does not match the date-time format `YYYY-MM-DDTHH:MM:SS.sssZ`")]
    DateTime,
    #[error("The value does not match the date format `YYYY-MM-DD`")]
    Date,
    #[error("The value does not match the time format `HH:MM:SS.sss`")]
    Time,
    #[error("{0:?}")]
    Duration(ParseDurationError),
}

impl StringFormat {
    /// Validates the provided value against the string format.
    ///
    /// # Errors
    ///
    /// - [`Url`] if the value is not a valid URL.
    /// - [`IpAddress`] if the value is not a valid IP address as specified by [`Ipv4Addr`] or
    ///   [`Ipv6Addr`].
    /// - [`Uuid`] if the value is not a valid [UUID][uuid::Uuid].
    /// - [`Regex`] if the value is not a valid [regular expression][regex::Regex].
    /// - [`Email`] if the value is not a valid [email address][email_address::EmailAddress].
    /// - [`Date`] if the value is not a valid date in the format `YYYY-MM-DD`.
    /// - [`Time`] if the value is not a valid time in the format `HH:MM:SS.sss`.
    /// - [`DateTime`] if the value is not a valid date-time in the format
    ///   `YYYY-MM-DDTHH:MM:SS.sssZ`.
    /// - [`Duration`] if the value is not a valid [ISO 8601 duration][iso8601_duration::Duration].
    ///
    /// [`Url`]: StringFormatError::Url
    /// [`IpAddress`]: StringFormatError::IpAddress
    /// [`Uuid`]: StringFormatError::Uuid
    /// [`Regex`]: StringFormatError::Regex
    /// [`Email`]: StringFormatError::Email
    /// [`Date`]: StringFormatError::Date
    /// [`Time`]: StringFormatError::Time
    /// [`DateTime`]: StringFormatError::DateTime
    /// [`Duration`]: StringFormatError::Duration
    #[expect(clippy::missing_panics_doc)]
    pub fn validate(self, value: &str) -> Result<(), Report<StringFormatError>> {
        // Only the simplest date format are supported in all three, RFC-3339, ISO-8601 and HTML
        const DATE_REGEX_STRING: &str = r"(?P<Y>\d{4})-(?P<M>\d{2})-(?P<D>\d{2})";
        static DATE_REGEX: OnceLock<Regex> = OnceLock::new();

        // Only the simplest time format are supported in all three, RFC-3339, ISO-8601 and HTML
        const TIME_REGEX_STRING: &str =
            r"(?P<h>\d{2}):(?P<m>\d{2}):(?P<s>\d{2}(?:\.\d+)?)(?:(?P<Z>[+-]\d{2}):(?P<z>\d{2})|Z)";
        static TIME_REGEX: OnceLock<Regex> = OnceLock::new();

        static DATE_TIME_REGEX: OnceLock<Regex> = OnceLock::new();

        match self {
            Self::Uri => {
                Url::parse(value).map_err(StringFormatError::Url)?;
            }
            Self::Hostname => {
                Host::parse(value).map_err(StringFormatError::Url)?;
            }
            Self::Ipv4 => {
                Ipv4Addr::from_str(value).map_err(StringFormatError::IpAddress)?;
            }
            Self::Ipv6 => {
                Ipv6Addr::from_str(value).map_err(StringFormatError::IpAddress)?;
            }
            Self::Uuid => {
                Uuid::parse_str(value).map_err(StringFormatError::Uuid)?;
            }
            Self::Regex => {
                Regex::new(value).map_err(StringFormatError::Regex)?;
            }
            Self::Email => {
                EmailAddress::from_str(value).map_err(StringFormatError::Email)?;
            }
            Self::Date => {
                DATE_REGEX
                    .get_or_init(|| {
                        Regex::new(&format!("^{DATE_REGEX_STRING}$"))
                            .expect("failed to compile date regex")
                    })
                    .is_match(value)
                    .then_some(())
                    .ok_or(StringFormatError::Date)?;
            }
            Self::Time => {
                TIME_REGEX
                    .get_or_init(|| {
                        Regex::new(&format!("^{TIME_REGEX_STRING}$"))
                            .expect("failed to compile time regex")
                    })
                    .is_match(value)
                    .then_some(())
                    .ok_or(StringFormatError::Time)?;
            }
            Self::DateTime => {
                DATE_TIME_REGEX
                    .get_or_init(|| {
                        Regex::new(&format!("^{DATE_REGEX_STRING}T{TIME_REGEX_STRING}$"))
                            .expect("failed to compile date-time regex")
                    })
                    .is_match(value)
                    .then_some(())
                    .ok_or(StringFormatError::DateTime)?;
            }
            Self::Duration => {
                Duration::from_str(value).map_err(StringFormatError::Duration)?;
            }
        }
        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum StringValidationError {
    #[error(
        "the provided value is not greater than or equal to the minimum length, expected \
         the length of `{}` to be greater than or equal to `{expected}` but it is `{}`",
        .actual,
        .actual.len(),
    )]
    MinLength { actual: String, expected: usize },
    #[error(
        "the provided value is not less than or equal to the maximum length, expected \
         the length of `{}` to be less than or equal to `{expected}` but it is `{}`", .actual, .actual.len(),
    )]
    MaxLength { actual: String, expected: usize },
    #[error(
        "the provided value does not match the expected pattern, expected `{actual}` to match the \
         pattern `{}`", .expected.as_str()
    )]
    Pattern { actual: String, expected: Regex },
    #[error(
        "the provided value does not match the expected format, expected `{actual}` to match the \
         format `{}`", .expected.as_str()
    )]
    Format {
        actual: String,
        expected: StringFormat,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StringTypeTag {
    String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase", deny_unknown_fields)]
pub enum StringSchema {
    Constrained(StringConstraints),
    Const {
        r#const: String,
    },
    Enum {
        #[cfg_attr(target_arch = "wasm32", tsify(type = "[string, ...string[]]"))]
        r#enum: HashSet<String>,
    },
}

impl Constraint for StringSchema {
    #[expect(clippy::too_many_lines)]
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Constrained(lhs), Self::Constrained(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::Constrained(lhs), rhs.map(Self::Constrained)))?,
            (Self::Const { r#const }, Self::Constrained(constraints))
            | (Self::Constrained(constraints), Self::Const { r#const }) => {
                constraints.validate_value(&r#const).change_context(
                    ResolveClosedDataTypeError::UnsatisfiedConstraint(
                        json!(r#const),
                        ValueConstraints::Typed(SingleValueConstraints::String(Self::Constrained(
                            constraints,
                        ))),
                    ),
                )?;

                (Self::Const { r#const }, None)
            }
            (Self::Enum { r#enum }, Self::Constrained(constraints))
            | (Self::Constrained(constraints), Self::Enum { r#enum }) => {
                // We use the fast way to filter the values that pass the constraints and collect
                // them. In most cases this will result in at least one value
                // passing the constraints.
                let passed = r#enum
                    .iter()
                    .filter(|&value| constraints.is_valid(value))
                    .cloned()
                    .collect::<HashSet<_>>();

                match passed.len() {
                    0 => {
                        // We now properly capture errors to return it to the caller.
                        let () = r#enum
                            .iter()
                            .map(|value| {
                                constraints.validate_value(value).change_context(
                                    ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(
                                        json!(*value),
                                    ),
                                )
                            })
                            .try_collect_reports()
                            .change_context(
                                ResolveClosedDataTypeError::UnsatisfiedEnumConstraint(
                                    ValueConstraints::Typed(SingleValueConstraints::String(
                                        Self::Constrained(constraints.clone()),
                                    )),
                                ),
                            )?;

                        // This should only happen if `enum` is malformed and has no values. This
                        // should be caught by the schema validation, however, if this still happens
                        // we return an error as validating empty enum will always fail.
                        bail!(ResolveClosedDataTypeError::UnsatisfiedEnumConstraint(
                            ValueConstraints::Typed(SingleValueConstraints::String(
                                Self::Constrained(constraints),
                            )),
                        ))
                    }
                    1 => (
                        Self::Const {
                            r#const: passed.into_iter().next().unwrap_or_else(|| {
                                unreachable!(
                                    "we have exactly one value in the enum that passed the \
                                     constraints"
                                )
                            }),
                        },
                        None,
                    ),
                    _ => (Self::Enum { r#enum: passed }, None),
                }
            }
            (Self::Const { r#const: lhs }, Self::Const { r#const: rhs }) => {
                if lhs == rhs {
                    (Self::Const { r#const: lhs }, None)
                } else {
                    bail!(ResolveClosedDataTypeError::ConflictingConstValues(
                        json!(lhs),
                        json!(rhs),
                    ))
                }
            }
            (Self::Enum { r#enum: lhs }, Self::Enum { r#enum: rhs }) => {
                let intersection = lhs.intersection(&rhs).cloned().collect::<HashSet<_>>();

                match intersection.len() {
                    0 => bail!(ResolveClosedDataTypeError::ConflictingEnumValues(
                        lhs.iter().map(|val| json!(*val)).collect(),
                        rhs.iter().map(|val| json!(*val)).collect(),
                    )),
                    1 => (
                        Self::Const {
                            r#const: intersection.into_iter().next().unwrap_or_else(|| {
                                unreachable!(
                                    "we have exactly least one value in the enum intersection"
                                )
                            }),
                        },
                        None,
                    ),
                    _ => (
                        Self::Enum {
                            r#enum: intersection,
                        },
                        None,
                    ),
                }
            }
            (Self::Const { r#const }, Self::Enum { r#enum })
            | (Self::Enum { r#enum }, Self::Const { r#const }) => {
                ensure!(
                    r#enum.contains(&r#const),
                    ResolveClosedDataTypeError::ConflictingConstEnumValue(
                        json!(r#const),
                        r#enum.iter().map(|val| json!(*val)).collect(),
                    )
                );

                (Self::Const { r#const }, None)
            }
        })
    }
}

impl ConstraintValidator<JsonValue> for StringSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        if let JsonValue::String(string) = value {
            self.is_valid(string.as_str())
        } else {
            false
        }
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        if let JsonValue::String(string) = value {
            self.validate_value(string.as_str())
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::String,
            });
        }
    }
}

impl ConstraintValidator<str> for StringSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &str) -> bool {
        match self {
            Self::Constrained(constraints) => constraints.is_valid(value),
            Self::Const { r#const } => value == r#const,
            Self::Enum { r#enum } => r#enum.contains(value),
        }
    }

    fn validate_value(&self, value: &str) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(value)
                .change_context(ConstraintError::ValueConstraint)?,
            Self::Const { r#const } => {
                if value != *r#const {
                    bail!(ConstraintError::InvalidConstValue {
                        actual: JsonValue::String(value.to_owned()),
                        expected: JsonValue::String(r#const.clone()),
                    });
                }
            }
            Self::Enum { r#enum } => {
                if !r#enum.contains(value) {
                    bail!(ConstraintError::InvalidEnumValue {
                        actual: JsonValue::String(value.to_owned()),
                        expected: r#enum.iter().cloned().map(JsonValue::String).collect(),
                    });
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StringConstraints {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::regex::option"
    )]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "string"))]
    pub pattern: Option<Regex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<StringFormat>,
}

impl Constraint for StringConstraints {
    fn intersection(
        mut self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        let mut remainder = None::<Self>;

        self.min_length = match self.min_length.zip(other.min_length) {
            Some((lhs, rhs)) => Some(lhs.max(rhs)),
            None => self.min_length.or(other.min_length),
        };
        self.max_length = match self.max_length.zip(other.max_length) {
            Some((lhs, rhs)) => Some(lhs.min(rhs)),
            None => self.max_length.or(other.max_length),
        };
        match self.format.zip(other.format) {
            Some((lhs, rhs)) if lhs == rhs => {}
            Some((_, rhs)) => {
                remainder.get_or_insert_default().format = Some(rhs);
            }
            None => self.format = self.format.or(other.format),
        };
        match self.pattern.as_ref().zip(other.pattern.as_ref()) {
            Some((lhs, rhs)) if lhs.as_str() == rhs.as_str() => {}
            Some((_, _)) => {
                remainder.get_or_insert_default().pattern = other.pattern;
            }
            None => self.pattern = self.pattern.or(other.pattern),
        };

        if let Some((min_length, max_length)) = self.min_length.zip(self.max_length) {
            ensure!(
                min_length <= max_length,
                ResolveClosedDataTypeError::UnsatisfiableConstraint(ValueConstraints::Typed(
                    SingleValueConstraints::String(StringSchema::Constrained(Self {
                        min_length: Some(min_length),
                        max_length: Some(max_length),
                        ..Self::default()
                    }),)
                ),)
            );
        }

        Ok((self, remainder))
    }
}

impl ConstraintValidator<str> for StringConstraints {
    type Error = [StringValidationError];

    fn is_valid(&self, value: &str) -> bool {
        if let Some(expected) = self.min_length {
            if value.len() < expected {
                return false;
            }
        }
        if let Some(expected) = self.max_length {
            if value.len() > expected {
                return false;
            }
        }
        if let Some(expected) = &self.pattern {
            if !expected.is_match(value) {
                return false;
            }
        }
        if let Some(expected) = self.format {
            if expected.validate(value).is_err() {
                return false;
            }
        }

        true
    }

    fn validate_value(&self, value: &str) -> Result<(), Report<[StringValidationError]>> {
        let mut status = ReportSink::new();

        if let Some(expected) = self.min_length {
            if value.len() < expected {
                status.capture(StringValidationError::MinLength {
                    actual: value.to_owned(),
                    expected,
                });
            }
        }
        if let Some(expected) = self.max_length {
            if value.len() > expected {
                status.capture(StringValidationError::MaxLength {
                    actual: value.to_owned(),
                    expected,
                });
            }
        }
        if let Some(expected) = &self.pattern {
            if !expected.is_match(value) {
                status.capture(StringValidationError::Pattern {
                    actual: value.to_owned(),
                    expected: expected.clone(),
                });
            }
        }
        if let Some(expected) = self.format {
            if let Err(error) = expected.validate(value) {
                status.append(error.change_context(StringValidationError::Format {
                    actual: value.to_owned(),
                    expected,
                }));
            }
        }

        status.finish()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{from_value, json};

    use super::*;
    use crate::schema::{
        JsonSchemaValueType, SingleValueConstraints,
        data_type::constraint::{
            ValueConstraints,
            tests::{
                check_constraints, check_constraints_error, check_schema_intersection,
                check_schema_intersection_error, intersect_schemas, read_schema,
            },
        },
    };

    #[test]
    fn unconstrained() {
        let string_schema = read_schema(&json!({
            "type": "string",
        }));

        check_constraints(&string_schema, &json!("NaN"));
        check_constraints_error(&string_schema, &json!(10), [ConstraintError::InvalidType {
            actual: JsonSchemaValueType::Number,
            expected: JsonSchemaValueType::String,
        }]);
    }

    #[test]
    fn simple_string() {
        let string_schema = read_schema(&json!({
            "type": "string",
            "minLength": 5,
            "maxLength": 10,
        }));

        check_constraints(&string_schema, &json!("12345"));
        check_constraints(&string_schema, &json!("1234567890"));
        check_constraints_error(&string_schema, &json!(2), [ConstraintError::InvalidType {
            actual: JsonSchemaValueType::Number,
            expected: JsonSchemaValueType::String,
        }]);
        check_constraints_error(&string_schema, &json!("1234"), [
            StringValidationError::MinLength {
                actual: "1234".to_owned(),
                expected: 5,
            },
        ]);
        check_constraints_error(&string_schema, &json!("12345678901"), [
            StringValidationError::MaxLength {
                actual: "12345678901".to_owned(),
                expected: 10,
            },
        ]);
    }

    #[test]
    fn constant() {
        let string_schema = read_schema(&json!({
            "type": "string",
            "const": "foo",
        }));

        check_constraints(&string_schema, &json!("foo"));
        check_constraints_error(&string_schema, &json!("bar"), [
            ConstraintError::InvalidConstValue {
                actual: json!("bar"),
                expected: json!("foo"),
            },
        ]);
    }

    #[test]
    fn enumeration() {
        let string_schema = read_schema(&json!({
            "type": "string",
            "enum": ["foo"],
        }));

        check_constraints(&string_schema, &json!("foo"));
        check_constraints_error(&string_schema, &json!("bar"), [
            ConstraintError::InvalidEnumValue {
                actual: json!("bar"),
                expected: vec![json!("foo")],
            },
        ]);
    }

    #[test]
    fn missing_type() {
        from_value::<ValueConstraints>(json!({
            "minLength": 0.0,
        }))
        .expect_err("Deserialized string schema without type");
    }

    #[test]
    fn additional_string_properties() {
        from_value::<ValueConstraints>(json!({
            "type": "string",
            "additional": false,
        }))
        .expect_err("Deserialized string schema with additional properties");
    }

    #[test]
    fn mixed() {
        from_value::<ValueConstraints>(json!({
            "type": "string",
            "const": "foo",
            "minLength": 5,
        }))
        .expect_err("Deserialized string schema with mixed properties");
        from_value::<ValueConstraints>(json!({
            "type": "string",
            "enum": ["foo", "bar"],
            "minLength": 5,
        }))
        .expect_err("Deserialized string schema with mixed properties");
        from_value::<ValueConstraints>(json!({
            "type": "string",
            "const": "bar",
            "enum": ["foo", "bar"],
        }))
        .expect_err("Deserialized string schema with mixed properties");
    }

    #[test]
    fn intersect_default() {
        check_schema_intersection(
            [
                json!({
                        "type": "string",
                }),
                json!({
                        "type": "string",
                }),
            ],
            [json!({
                    "type": "string",
            })],
        );
    }

    #[test]
    fn intersect_length_one() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "minLength": 5,
                    "maxLength": 10,
                }),
                json!({
                    "type": "string",
                }),
            ],
            [json!({
                "type": "string",
                "minLength": 5,
                "maxLength": 10,
            })],
        );
    }

    #[test]
    fn intersect_length_both() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "minLength": 5,
                    "maxLength": 10,
                }),
                json!({
                    "type": "string",
                    "minLength": 7,
                    "maxLength": 12,
                }),
            ],
            [json!({
                "type": "string",
                "minLength": 7,
                "maxLength": 10,
            })],
        );
    }

    #[test]
    fn intersect_length_invalid() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "string",
                    "minLength": 5,
                    "maxLength": 10,
                }),
                json!({
                    "type": "string",
                    "minLength": 12,
                    "maxLength": 15,
                }),
            ],
            [ResolveClosedDataTypeError::UnsatisfiableConstraint(
                from_value(json!(
                    {
                        "type": "string",
                        "minLength": 12,
                        "maxLength": 10,
                    }
                ))
                .expect("Failed to parse schema"),
            )],
        );
    }

    #[test]
    fn intersect_pattern_one() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "pattern": "^[0-9]{5}$",
                }),
                json!({
                    "type": "string",
                }),
            ],
            [json!({
                "type": "string",
                "pattern": "^[0-9]{5}$",
            })],
        );
    }

    #[test]
    fn intersect_pattern_both_different() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "pattern": r"^\d{5}$",
                }),
                json!({
                    "type": "string",
                    "pattern": "^[0-9]{5}$",
                }),
            ],
            [
                json!({
                    "type": "string",
                    "pattern": r"^\d{5}$",
                }),
                json!({
                    "type": "string",
                    "pattern": "^[0-9]{5}$",
                }),
            ],
        );
    }

    #[test]
    fn intersect_pattern_both_same() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "pattern": r"^\d{5}$",
                }),
                json!({
                    "type": "string",
                    "pattern": r"^\d{5}$",
                }),
            ],
            [json!({
                "type": "string",
                "pattern": r"^\d{5}$",
            })],
        );
    }

    #[test]
    fn intersect_format_one() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "format": "uri",
                }),
                json!({
                    "type": "string",
                }),
            ],
            [json!({
                "type": "string",
                "format": "uri",
            })],
        );
    }

    #[test]
    fn intersect_format_both_different() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "format": "uri",
                }),
                json!({
                    "type": "string",
                    "format": "hostname",
                }),
            ],
            [
                json!({
                    "type": "string",
                    "format": "uri",
                }),
                json!({
                    "type": "string",
                    "format": "hostname",
                }),
            ],
        );
    }

    #[test]
    fn intersect_format_both_same() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "format": "uri",
                }),
                json!({
                    "type": "string",
                    "format": "uri",
                }),
            ],
            [json!({
                "type": "string",
                "format": "uri",
            })],
        );
    }

    #[test]
    fn intersect_const_const_same() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "const": "foo",
                }),
                json!({
                    "type": "string",
                    "const": "foo",
                }),
            ],
            [json!({
                "type": "string",
                "const": "foo",
            })],
        );
    }

    #[test]
    fn intersect_const_const_different() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "string",
                    "const": "foo",
                }),
                json!({
                    "type": "string",
                    "const": "bar",
                }),
            ],
            [ResolveClosedDataTypeError::ConflictingConstValues(
                json!("foo"),
                json!("bar"),
            )],
        );
    }

    #[test]
    fn intersect_const_enum_compatible() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "const": "foo",
                }),
                json!({
                    "type": "string",
                    "enum": ["foo", "bar"],
                }),
            ],
            [json!({
                "type": "string",
                "const": "foo",
            })],
        );
    }

    #[test]
    fn intersect_const_enum_incompatible() {
        let report = intersect_schemas([
            json!({
                "type": "string",
                "const": "foo",
            }),
            json!({
                "type": "string",
                "enum": ["bar", "baz"],
            }),
        ])
        .expect_err("Intersected invalid schemas");

        let Some(ResolveClosedDataTypeError::ConflictingConstEnumValue(lhs, rhs)) =
            report.downcast_ref::<ResolveClosedDataTypeError>()
        else {
            panic!("Expected conflicting const-enum values error");
        };
        assert_eq!(lhs, &json!("foo"));

        assert_eq!(rhs.len(), 2);
        assert!(rhs.contains(&json!("bar")));
        assert!(rhs.contains(&json!("baz")));
    }

    #[test]
    fn intersect_enum_enum_compatible_multi() {
        let intersection = intersect_schemas([
            json!({
                "type": "string",
                "enum": ["foo", "bar", "baz"],
            }),
            json!({
                "type": "string",
                "enum": ["foo", "baz", "qux"],
            }),
            json!({
                "type": "string",
                "enum": ["foo", "bar", "qux", "baz"],
            }),
        ])
        .expect("Intersected invalid constraints")
        .into_iter()
        .map(|schema| {
            from_value::<SingleValueConstraints>(schema).expect("Failed to deserialize schema")
        })
        .collect::<Vec<_>>();

        // We need to manually check the intersection because the order of the enum values is not
        // guaranteed.
        assert_eq!(intersection.len(), 1);
        let SingleValueConstraints::String(StringSchema::Enum { r#enum }) = &intersection[0] else {
            panic!("Expected string enum schema");
        };
        assert_eq!(r#enum.len(), 2);
        assert!(r#enum.contains("foo"));
        assert!(r#enum.contains("baz"));
    }

    #[test]
    fn intersect_enum_enum_compatible_single() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "enum": ["foo", "bar"],
                }),
                json!({
                    "type": "string",
                    "enum": ["foo", "baz"],
                }),
                json!({
                    "type": "string",
                    "enum": ["foo", "qux"],
                }),
            ],
            [json!({
                "type": "string",
                "const": "foo",
            })],
        );
    }

    #[test]
    fn intersect_enum_enum_incompatible() {
        let report = intersect_schemas([
            json!({
                "type": "string",
                "enum": ["foo", "bar"],
            }),
            json!({
                "type": "string",
                "enum": ["baz", "qux"],
            }),
        ])
        .expect_err("Intersected invalid schemas");

        let Some(ResolveClosedDataTypeError::ConflictingEnumValues(lhs, rhs)) =
            report.downcast_ref::<ResolveClosedDataTypeError>()
        else {
            panic!("Expected conflicting enum values error");
        };
        assert_eq!(lhs.len(), 2);
        assert!(lhs.contains(&json!("foo")));
        assert!(lhs.contains(&json!("bar")));

        assert_eq!(rhs.len(), 2);
        assert!(rhs.contains(&json!("baz")));
        assert!(rhs.contains(&json!("qux")));
    }

    #[test]
    fn intersect_const_constraint_compatible() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "const": "foo",
                }),
                json!({
                    "type": "string",
                    "minLength": 3,
                }),
            ],
            [json!({
                "type": "string",
                "const": "foo",
            })],
        );
    }

    #[test]
    fn intersect_const_constraint_incompatible() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "string",
                    "const": "foo",
                }),
                json!({
                    "type": "string",
                    "minLength": 5,
                }),
            ],
            [ResolveClosedDataTypeError::UnsatisfiedConstraint(
                json!("foo"),
                from_value(json!({
                    "type": "string",
                    "minLength": 5,
                }))
                .expect("Failed to parse schema"),
            )],
        );
    }

    #[test]
    fn intersect_enum_constraint_compatible_single() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "enum": ["foo", "foobar"],
                }),
                json!({
                    "type": "string",
                    "minLength": 5,
                }),
            ],
            [json!({
                "type": "string",
                "const": "foobar",
            })],
        );
    }

    #[test]
    fn intersect_enum_constraint_compatible_multi() {
        let intersection = intersect_schemas([
            json!({
                "type": "string",
                "enum": ["foo", "foobar", "bar"],
            }),
            json!({
                "type": "string",
                "maxLength": 3,
            }),
        ])
        .expect("Intersected invalid constraints")
        .into_iter()
        .map(|schema| {
            from_value::<SingleValueConstraints>(schema).expect("Failed to deserialize schema")
        })
        .collect::<Vec<_>>();

        // We need to manually check the intersection because the order of the enum values is not
        // guaranteed.
        assert_eq!(intersection.len(), 1);
        let SingleValueConstraints::String(StringSchema::Enum { r#enum }) = &intersection[0] else {
            panic!("Expected string enum schema");
        };
        assert_eq!(r#enum.len(), 2);
        assert!(r#enum.contains("foo"));
        assert!(r#enum.contains("bar"));
    }

    #[test]
    fn intersect_enum_constraint_incompatible() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "string",
                    "enum": ["foo", "bar"],
                }),
                json!({
                    "type": "string",
                    "minLength": 5,
                }),
            ],
            [
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraint(
                    from_value(json!({
                        "type": "string",
                        "minLength": 5,
                    }))
                    .expect("Failed to parse schema"),
                ),
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(json!("foo")),
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(json!("bar")),
            ],
        );
    }

    #[test]
    fn intersect_mixed() {
        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "minLength": 5,
                }),
                json!({
                    "type": "string",
                    "pattern": "^[0-9]{5}$",
                }),
                json!({
                    "type": "string",
                    "minLength": 8,
                }),
                json!({
                    "type": "string",
                    "format": "uri",
                }),
                json!({
                    "type": "string",
                    "maxLength": 10,
                }),
                json!({
                    "type": "string",
                    "pattern": r"^\d{5}$",
                }),
            ],
            [
                json!({
                    "type": "string",
                    "minLength": 8,
                    "maxLength": 10,
                    "pattern": "^[0-9]{5}$",
                    "format": "uri",
                }),
                json!({
                    "type": "string",
                    "pattern": r"^\d{5}$",
                }),
            ],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "string",
                    "minLength": 2,
                }),
                json!({
                    "type": "string",
                    "maxLength": 8,
                }),
                json!({
                    "type": "string",
                    "format": "hostname",
                }),
                json!({
                    "type": "string",
                    "maxLength": 10,
                }),
                json!({
                    "type": "string",
                    "pattern": "^[a-z]{3}$",
                }),
                json!({
                    "type": "string",
                    "enum": ["foo", "foobar"],
                }),
            ],
            [json!({
                "type": "string",
                "const": "foo",
            })],
        );
    }
}
