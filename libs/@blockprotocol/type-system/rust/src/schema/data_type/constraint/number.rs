use error_stack::{Report, ReportSink, ResultExt, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Number as JsonNumber, Value as JsonValue, json};
use thiserror::Error;

use crate::schema::{ConstraintError, JsonSchemaValueType, data_type::constraint::Constraint};

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
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum NumberTypeTag {
    Number,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase", deny_unknown_fields)]
pub enum NumberSchema {
    Constrained(NumberConstraints),
    Const {
        r#const: f64,
    },
    Enum {
        #[cfg_attr(target_arch = "wasm32", tsify(type = "[number, ...number[]]"))]
        r#enum: Vec<f64>,
    },
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

#[expect(
    clippy::float_arithmetic,
    reason = "Validation requires floating point arithmetic"
)]
fn float_multiple_of(lhs: f64, rhs: f64) -> bool {
    if float_eq(rhs, 0.0) {
        return false;
    }
    let quotient = lhs / rhs;
    (quotient - quotient.round()).abs() < f64::EPSILON
}

impl Constraint<JsonValue> for NumberSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        if let JsonValue::Number(number) = value {
            self.is_valid(number)
        } else {
            false
        }
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        if let JsonValue::Number(number) = value {
            self.validate_value(number)
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Number,
            });
        }
    }
}

impl Constraint<JsonNumber> for NumberSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonNumber) -> bool {
        value
            .as_f64()
            .map_or(false, |number| self.is_valid(&number))
    }

    fn validate_value(&self, value: &JsonNumber) -> Result<(), Report<ConstraintError>> {
        value.as_f64().map_or_else(
            || {
                Err(Report::new(NumberValidationError::InsufficientPrecision {
                    actual: value.clone(),
                })
                .change_context(ConstraintError::ValueConstraint))
            },
            |number| self.validate_value(&number),
        )
    }
}

impl Constraint<f64> for NumberSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &f64) -> bool {
        match self {
            Self::Constrained(constraints) => constraints.is_valid(value),
            Self::Const { r#const } => float_eq(*value, *r#const),
            Self::Enum { r#enum } => r#enum.iter().any(|expected| float_eq(*value, *expected)),
        }
    }

    fn validate_value(&self, value: &f64) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(value)
                .change_context(ConstraintError::ValueConstraint)?,
            Self::Const { r#const } => {
                if !float_eq(*value, *r#const) {
                    bail!(ConstraintError::InvalidConstValue {
                        actual: json!(*value),
                        expected: json!(*r#const),
                    });
                }
            }
            Self::Enum { r#enum } => {
                if !r#enum.iter().any(|expected| float_eq(*value, *expected)) {
                    bail!(ConstraintError::InvalidEnumValue {
                        actual: json!(*value),
                        expected: r#enum.iter().map(|value| json!(*value)).collect(),
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
pub struct NumberConstraints {
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

impl Constraint<f64> for NumberConstraints {
    type Error = [NumberValidationError];

    fn is_valid(&self, value: &f64) -> bool {
        if let Some(minimum) = self.minimum {
            if self.exclusive_minimum && float_less_eq(*value, minimum)
                || float_less(*value, minimum)
            {
                return false;
            }
        }

        if let Some(maximum) = self.maximum {
            if self.exclusive_maximum && float_less_eq(maximum, *value)
                || float_less(maximum, *value)
            {
                return false;
            }
        }

        if let Some(expected) = self.multiple_of {
            if !float_multiple_of(*value, expected) {
                return false;
            }
        }

        true
    }

    fn validate_value(&self, value: &f64) -> Result<(), Report<[NumberValidationError]>> {
        let mut status = ReportSink::new();

        if let Some(minimum) = self.minimum {
            if self.exclusive_minimum {
                if float_less_eq(*value, minimum) {
                    status.capture(NumberValidationError::ExclusiveMinimum {
                        actual: *value,
                        expected: minimum,
                    });
                }
            } else if float_less(*value, minimum) {
                status.capture(NumberValidationError::Minimum {
                    actual: *value,
                    expected: minimum,
                });
            }
        }

        if let Some(maximum) = self.maximum {
            if self.exclusive_maximum {
                if float_less_eq(maximum, *value) {
                    status.capture(NumberValidationError::ExclusiveMaximum {
                        actual: *value,
                        expected: maximum,
                    });
                }
            } else if float_less(maximum, *value) {
                status.capture(NumberValidationError::Maximum {
                    actual: *value,
                    expected: maximum,
                });
            }
        }

        if let Some(expected) = self.multiple_of {
            if !float_multiple_of(*value, expected) {
                status.capture(NumberValidationError::MultipleOf {
                    actual: *value,
                    expected,
                });
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
        JsonSchemaValueType, NumberValidationError,
        data_type::constraint::{
            ValueConstraints,
            tests::{check_constraints, check_constraints_error, read_schema},
        },
    };

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

    #[test]
    fn compare_modulo() {
        assert!(float_multiple_of(10.0, 5.0));
        assert!(!float_multiple_of(10.0, 3.0));
        assert!(float_multiple_of(10.0, 2.5));
        assert!(float_multiple_of(1e9, 1e6));
        assert!(float_multiple_of(0.0001, 0.00001));
        assert!(float_multiple_of(-10.0, -5.0));
        assert!(float_multiple_of(-10.0, 5.0));
        assert!(!float_multiple_of(10.0, 0.0));
        assert!(float_multiple_of(0.0, 5.0));
        assert!(!float_multiple_of(0.1, 0.03));
    }

    #[test]
    fn unconstrained() {
        let number_schema = read_schema(&json!({
            "type": "number",
        }));

        check_constraints(&number_schema, &json!(0));
        check_constraints_error(&number_schema, &json!("NaN"), [
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: JsonSchemaValueType::Number,
            },
        ]);
    }

    #[test]
    fn simple_number() {
        let number_schema = read_schema(&json!({
            "type": "number",
            "minimum": 0.0,
            "maximum": 10.0,
        }));

        check_constraints(&number_schema, &json!(0));
        check_constraints(&number_schema, &json!(10));
        check_constraints_error(&number_schema, &json!("2"), [
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: JsonSchemaValueType::Number,
            },
        ]);
        check_constraints_error(&number_schema, &json!(-2), [
            NumberValidationError::Minimum {
                actual: -2.0,
                expected: 0.0,
            },
        ]);
        check_constraints_error(&number_schema, &json!(15), [
            NumberValidationError::Maximum {
                actual: 15.0,
                expected: 10.0,
            },
        ]);
    }

    #[test]
    fn simple_number_exclusive() {
        let number_schema = read_schema(&json!({
            "type": "number",
            "minimum": 0.0,
            "exclusiveMinimum": true,
            "maximum": 10.0,
            "exclusiveMaximum": true,
        }));

        check_constraints(&number_schema, &json!(0.1));
        check_constraints(&number_schema, &json!(0.9));
        check_constraints_error(&number_schema, &json!("2"), [
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: JsonSchemaValueType::Number,
            },
        ]);
        check_constraints_error(&number_schema, &json!(0), [
            NumberValidationError::ExclusiveMinimum {
                actual: 0.0,
                expected: 0.0,
            },
        ]);
        check_constraints_error(&number_schema, &json!(10), [
            NumberValidationError::ExclusiveMaximum {
                actual: 10.0,
                expected: 10.0,
            },
        ]);
    }

    #[test]
    fn multiple_of() {
        let number_schema = read_schema(&json!({
            "type": "number",
            "multipleOf": 0.1,
        }));

        check_constraints(&number_schema, &json!(0.1));
        check_constraints(&number_schema, &json!(0.9));
        check_constraints_error(&number_schema, &json!("2"), [
            ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: JsonSchemaValueType::Number,
            },
        ]);
        check_constraints_error(&number_schema, &json!(0.11), [
            NumberValidationError::MultipleOf {
                actual: 0.11,
                expected: 0.1,
            },
        ]);
    }

    #[test]
    fn constant() {
        let number_schema = read_schema(&json!({
            "type": "number",
            "const": 50.0,
        }));

        check_constraints(&number_schema, &json!(50.0));
        check_constraints_error(&number_schema, &json!(10.0), [
            ConstraintError::InvalidConstValue {
                actual: json!(10.0),
                expected: json!(50.0),
            },
        ]);
    }

    #[test]
    fn enumeration() {
        let number_schema = read_schema(&json!({
            "type": "number",
            "enum": [20.0, 50.0],
        }));

        check_constraints(&number_schema, &json!(50.0));
        check_constraints_error(&number_schema, &json!(10.0), [
            ConstraintError::InvalidEnumValue {
                actual: json!(10.0),
                expected: vec![json!(20.0), json!(50.0)],
            },
        ]);
    }

    #[test]
    fn missing_type() {
        from_value::<ValueConstraints>(json!({
            "minimum": 0.0,
        }))
        .expect_err("Deserialized number schema without type");
    }

    #[test]
    fn additional_number_properties() {
        from_value::<ValueConstraints>(json!({
            "type": "number",
            "additional": false,
        }))
        .expect_err("Deserialized number schema with additional properties");
    }

    #[test]
    fn mixed() {
        from_value::<ValueConstraints>(json!({
            "type": "number",
            "const": 50,
            "minimum": 0,
        }))
        .expect_err("Deserialized number schema with mixed properties");
        from_value::<ValueConstraints>(json!({
            "type": "number",
            "enum": [50],
            "minimum": 0,
        }))
        .expect_err("Deserialized number schema with mixed properties");
        from_value::<ValueConstraints>(json!({
            "type": "number",
            "const": 50,
            "enum": [50],
        }))
        .expect_err("Deserialized number schema with mixed properties");
    }
}
