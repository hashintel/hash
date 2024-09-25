use core::{
    net::{AddrParseError, Ipv4Addr, Ipv6Addr},
    str::FromStr,
};
use std::{collections::HashSet, sync::OnceLock};

use email_address::EmailAddress;
use error_stack::{Report, ReportSink, ResultExt, bail};
use iso8601_duration::{Duration, ParseDurationError};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;
use url::{Host, Url};
use uuid::Uuid;

use crate::schema::ConstraintError;

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
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum StringTypeTag {
    String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase")]
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

impl StringSchema {
    /// Validates the provided value against the string schema.
    ///
    /// # Errors
    ///
    /// - [`InvalidConstValue`] if the value is not equal to the expected value.
    /// - [`InvalidEnumValue`] if the value is not one of the expected values.
    /// - [`ValueConstraint`] if the value does not match the expected constraints.
    ///
    /// [`InvalidConstValue`]: ConstraintError::InvalidConstValue
    /// [`InvalidEnumValue`]: ConstraintError::InvalidEnumValue
    /// [`ValueConstraint`]: ConstraintError::ValueConstraint
    pub fn validate_value(&self, string: &str) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(string)
                .change_context(ConstraintError::ValueConstraint)?,
            Self::Const { r#const } => {
                if string != *r#const {
                    bail!(ConstraintError::InvalidConstValue {
                        actual: JsonValue::String(string.to_owned()),
                        expected: JsonValue::String(r#const.clone()),
                    });
                }
            }
            Self::Enum { r#enum } => {
                if !r#enum.contains(string) {
                    bail!(ConstraintError::InvalidEnumValue {
                        actual: JsonValue::String(string.to_owned()),
                        expected: r#enum.iter().cloned().map(JsonValue::String).collect(),
                    });
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl StringConstraints {
    /// Validates the provided value against the string constraints.
    ///
    /// # Errors
    ///
    /// - [`MinLength`] if the value is shorter than the minimum length.
    /// - [`MaxLength`] if the value is longer than the maximum length.
    /// - [`Pattern`] if the value does not match the expected [`Regex`].
    /// - [`Format`] if the value does not match the expected [`StringFormat`].
    ///
    /// [`MinLength`]: StringValidationError::MinLength
    /// [`MaxLength`]: StringValidationError::MaxLength
    /// [`Pattern`]: StringValidationError::Pattern
    /// [`Format`]: StringValidationError::Format
    pub fn validate_value(&self, string: &str) -> Result<(), Report<[StringValidationError]>> {
        let mut status = ReportSink::new();

        if let Some(expected) = self.min_length {
            if string.len() < expected {
                status.capture(StringValidationError::MinLength {
                    actual: string.to_owned(),
                    expected,
                });
            }
        }
        if let Some(expected) = self.max_length {
            if string.len() > expected {
                status.capture(StringValidationError::MaxLength {
                    actual: string.to_owned(),
                    expected,
                });
            }
        }
        if let Some(expected) = &self.pattern {
            if !expected.is_match(string) {
                status.capture(StringValidationError::Pattern {
                    actual: string.to_owned(),
                    expected: expected.clone(),
                });
            }
        }
        if let Some(expected) = self.format {
            if let Err(error) = expected.validate(string) {
                status.append(error.change_context(StringValidationError::Format {
                    actual: string.to_owned(),
                    expected,
                }));
            }
        }

        status.finish()
    }
}
