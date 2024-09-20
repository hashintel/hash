use error_stack::{bail, Report};
use serde::{Deserialize, Serialize};
use serde_json::{json, Number as JsonNumber};
use thiserror::Error;

use crate::schema::DataTypeLabel;

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "Only used in serde skip_serializing_if"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Error)]
pub enum NumberValidationError {
    #[error(
        "the provided number cannot be converted into a 64-bit representation of IEEE floating \
         point number, the value provided is `{actual}`. If this issue is encountered please file \
         a bug report, the linear tracking issue for this error is `H-2980`"
    )]
    InsufficientPrecision { actual: JsonNumber },

    #[error(
        "the provided value is not equal to the expected value, expected `{actual}` to be equal \
         to `{expected}`"
    )]
    InvalidConstValue { actual: f64, expected: f64 },
    #[error("the provided value is not one of the expected values, expected `{actual}` to be one of `{}`", json!(expected))]
    InvalidEnumValue { actual: f64, expected: Vec<f64> },

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NumberSchema {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "DataTypeLabel::is_empty")]
    pub label: DataTypeLabel,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#const: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[number, ...number[]]"))]
    pub r#enum: Vec<f64>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub exclusive_minimum: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximum: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub exclusive_maximum: bool,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple_of: Option<f64>,
}

#[expect(
    clippy::float_arithmetic,
    reason = "Validation requires floating point arithmetic"
)]
fn float_eq(lhs: f64, rhs: f64) -> bool {
    f64::abs(lhs - rhs) < f64::EPSILON
}

#[expect(
    clippy::float_equality_without_abs,
    reason = "False positive: This is a comparison of floating point numbers, not a check for \
              equality"
)]
#[expect(
    clippy::float_arithmetic,
    reason = "Validation requires floating point arithmetic"
)]
fn float_less_eq(lhs: f64, rhs: f64) -> bool {
    lhs - rhs < f64::EPSILON
}

fn float_less(lhs: f64, rhs: f64) -> bool {
    float_less_eq(lhs, rhs) && !float_eq(lhs, rhs)
}

impl NumberSchema {
    pub fn validate_value(&self, number: &JsonNumber) -> Result<(), Report<NumberValidationError>> {
        let Some(float) = number.as_f64() else {
            bail!(NumberValidationError::InsufficientPrecision {
                actual: number.clone()
            });
        };

        let mut status = Ok::<(), Report<NumberValidationError>>(());

        if let Some(expected) = self.r#const {
            if float_eq(expected, float) {
                extend_report!(
                    status,
                    NumberValidationError::InvalidConstValue {
                        expected,
                        actual: float,
                    }
                );
            }
        }

        if !self.r#enum.is_empty()
            && !self
                .r#enum
                .iter()
                .any(|expected| float_eq(float, *expected))
        {
            extend_report!(
                status,
                NumberValidationError::InvalidEnumValue {
                    expected: self.r#enum.clone(),
                    actual: float.to_owned(),
                }
            );
        }

        if let Some(minimum) = self.minimum {
            if self.exclusive_minimum {
                if float_less_eq(float, minimum) {
                    extend_report!(
                        status,
                        NumberValidationError::ExclusiveMinimum {
                            actual: float,
                            expected: minimum
                        }
                    );
                }
            } else if float_less(float, minimum) {
                extend_report!(
                    status,
                    NumberValidationError::ExclusiveMinimum {
                        actual: float,
                        expected: minimum
                    }
                );
            }
        }

        if let Some(maximum) = self.maximum {
            if self.exclusive_maximum {
                if float_less_eq(maximum, float) {
                    extend_report!(
                        status,
                        NumberValidationError::ExclusiveMaximum {
                            actual: float,
                            expected: maximum
                        }
                    );
                }
            } else if float_less(maximum, float) {
                extend_report!(
                    status,
                    NumberValidationError::Maximum {
                        actual: float,
                        expected: maximum
                    }
                );
            }
        }

        if let Some(expected) = self.multiple_of {
            #[expect(
                clippy::float_arithmetic,
                clippy::modulo_arithmetic,
                reason = "Validation requires floating point arithmetic"
            )]
            if !float_eq(float % expected, 0.0) {
                extend_report!(
                    status,
                    NumberValidationError::MultipleOf {
                        actual: float,
                        expected
                    }
                );
            }
        }

        status
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[expect(clippy::float_cmp, reason = "Test case for float_eq")]
    fn compare_equality() {
        assert_ne!(0.1 + 0.2, 0.3);
        assert!(float_eq(0.1 + 0.2, 0.3));

        assert!(!float_eq(1.0, 1.0 + f64::EPSILON));
        assert!(float_eq(1.0, 1.0 + f64::EPSILON / 2.0));
        assert!(float_eq(1.0, 1.0));
        assert!(float_eq(1.0, 1.0 - f64::EPSILON / 2.0));
        assert!(!float_eq(1.0, 1.0 - f64::EPSILON));
    }

    #[test]
    fn compare_less() {
        assert!(float_less(1.0, 1.0 + f64::EPSILON));
        assert!(!float_less(1.0, 1.0 + f64::EPSILON / 2.0));
        assert!(!float_less(1.0, 1.0));
        assert!(!float_less(1.0, 1.0 - f64::EPSILON / 2.0));
        assert!(!float_less(1.0, 1.0 - f64::EPSILON));
    }

    #[test]
    fn compare_less_eq() {
        assert!(float_less_eq(1.0, 1.0 + f64::EPSILON));
        assert!(float_less_eq(1.0, 1.0 + f64::EPSILON / 2.0));
        assert!(float_less_eq(1.0, 1.0));
        assert!(float_less_eq(1.0, 1.0 - f64::EPSILON / 2.0));
        assert!(!float_less_eq(1.0, 1.0 - f64::EPSILON));
    }
}
