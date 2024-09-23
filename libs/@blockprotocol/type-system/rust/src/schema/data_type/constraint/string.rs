use core::{
    net::{Ipv4Addr, Ipv6Addr},
    str::FromStr,
};
use std::sync::OnceLock;

use email_address::EmailAddress;
use error_stack::Report;
use iso8601_duration::Duration;
use regex::Regex;
use serde::{Deserialize, Serialize};
use url::{Host, Url};
use uuid::Uuid;

use super::{extend_report, ConstraintError};
use crate::schema::{
    data_type::constraint::error::StringFormatError, DataType, JsonSchemaValueType,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
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

impl StringFormat {
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

pub(crate) fn check_string_constraints(
    actual: &str,
    data_type: &DataType,
    result: &mut Result<(), Report<ConstraintError>>,
) {
    if !data_type.json_type.contains(&JsonSchemaValueType::String) {
        extend_report!(
            *result,
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: data_type.json_type.clone()
            }
        );
    }

    if let Some(expected) = data_type.min_length {
        if actual.len() < expected {
            extend_report!(
                *result,
                ConstraintError::MinLength {
                    actual: actual.to_owned(),
                    expected
                }
            );
        }
    }
    if let Some(expected) = data_type.max_length {
        if actual.len() > expected {
            extend_report!(
                *result,
                ConstraintError::MaxLength {
                    actual: actual.to_owned(),
                    expected
                }
            );
        }
    }
    if let Some(expected) = &data_type.pattern {
        if !expected.is_match(actual) {
            extend_report!(
                *result,
                ConstraintError::Pattern {
                    actual: actual.to_owned(),
                    expected: expected.clone()
                }
            );
        }
    }
    if let Some(expected) = data_type.format {
        if let Err(error) = expected.validate(actual) {
            extend_report!(
                *result,
                error.change_context(ConstraintError::Format {
                    actual: actual.to_owned(),
                    expected
                })
            );
        }
    }
}
