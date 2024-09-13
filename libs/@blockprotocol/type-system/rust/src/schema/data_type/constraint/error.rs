use core::net::AddrParseError;
use std::collections::HashSet;

use iso8601_duration::ParseDurationError;
use regex::Regex;
use serde_json::{json, Number as JsonNumber, Value as JsonValue};
use thiserror::Error;

use crate::schema::{data_type::constraint::StringFormat, JsonSchemaValueType};

#[derive(Debug, Error)]
pub enum ConstraintError {
    // General constraints
    #[error(
        "the value provided does not match the expected type, expected `{}`, got \
         `{actual}`", json!(expected)
    )]
    InvalidType {
        actual: JsonSchemaValueType,
        expected: HashSet<JsonSchemaValueType>,
    },
    #[error(
        "the provided value is not equal to the expected value, expected `{actual:#}` to be equal \
         to `{expected:#}`"
    )]
    Const {
        actual: JsonValue,
        expected: JsonValue,
    },
    #[error("the provided value is not one of the expected values, expected `{actual:#}` to be one of `{:#}`", JsonValue::Array(.expected.clone()))]
    Enum {
        actual: JsonValue,
        expected: Vec<JsonValue>,
    },

    // Number constraints
    #[error(
        "the provided number cannot be converted into a 64-bit representation of IEEE floating \
         point number, the value provided is `{actual}`. If this issue is encountered please file \
         a bug report, the linear tracking issue for this error is `H-2980`"
    )]
    InsufficientPrecision { actual: JsonNumber },
    #[error(
        "the provided value is not greater than or equal to the minimum value, expected \
         `{actual}` to be greater than or equal to `{expected}`"
    )]
    Minimum { actual: f64, expected: f64 },
    #[error(
        "the provided value is not less than or equal to the maximum value, expected `{actual}` \
         to be less than or equal to `{expected}`"
    )]
    Maximum { actual: f64, expected: f64 },
    #[error(
        "the provided value is not greater than the minimum value, expected `{actual}` to be \
         strictly greater than `{expected}`"
    )]
    ExclusiveMinimum { actual: f64, expected: f64 },
    #[error(
        "the provided value is not less than the maximum value, expected `{actual}` to be \
         strictly less than `{expected}`"
    )]
    ExclusiveMaximum { actual: f64, expected: f64 },
    #[error(
        "the provided value is not a multiple of the expected value, expected `{actual}` to be a \
         multiple of `{expected}`"
    )]
    MultipleOf { actual: f64, expected: f64 },

    // String constraints
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
