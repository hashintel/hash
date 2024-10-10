use error_stack::{Report, ReportSink, ResultExt, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Number as JsonNumber, Value as JsonValue, json};
use thiserror::Error;

use crate::schema::{
    ConstraintError, JsonSchemaValueType, SingleValueConstraints,
    data_type::{closed::ResolveClosedDataTypeError, constraint::ValueConstraints},
};

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

impl NumberSchema {
    /// Validates the provided value against the number schema.
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
    pub fn validate_value(&self, number: &JsonNumber) -> Result<(), Report<ConstraintError>> {
        let Some(float) = number.as_f64() else {
            bail!(
                Report::new(NumberValidationError::InsufficientPrecision {
                    actual: number.clone()
                })
                .change_context(ConstraintError::ValueConstraint)
            );
        };

        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(float)
                .change_context(ConstraintError::ValueConstraint)?,
            Self::Const { r#const } => {
                if !float_eq(float, *r#const) {
                    bail!(ConstraintError::InvalidConstValue {
                        actual: JsonValue::Number(number.clone()),
                        expected: json!(*r#const),
                    });
                }
            }
            Self::Enum { r#enum } => {
                if !r#enum.iter().any(|expected| float_eq(float, *expected)) {
                    bail!(ConstraintError::InvalidEnumValue {
                        actual: JsonValue::Number(number.clone()),
                        expected: r#enum.iter().map(|value| json!(*value)).collect(),
                    });
                }
            }
        }
        Ok(())
    }

    pub fn combine(
        &mut self,
        other: Self,
    ) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>> {
        match (&mut *self, other) {
            (Self::Constrained(lhs), Self::Constrained(rhs)) => {
                Ok(lhs.combine(rhs)?.map(Self::Constrained))
            }
            (Self::Const { r#const: lhs }, Self::Const { r#const: rhs }) => {
                if float_eq(*lhs, rhs) {
                    Ok(None)
                } else {
                    bail!(ResolveClosedDataTypeError::ConflictingConstValues(
                        json!(*lhs),
                        json!(rhs),
                    ))
                }
            }
            (Self::Enum { r#enum: lhs }, Self::Enum { r#enum: mut rhs }) => {
                rhs.retain(|value| lhs.iter().any(|other| float_eq(*value, *other)));
                ensure!(
                    !rhs.is_empty(),
                    ResolveClosedDataTypeError::ConflictingEnumValues(
                        lhs.iter().map(|val| json!(*val)).collect(),
                        rhs.iter().map(|val| json!(*val)).collect(),
                    )
                );
                *lhs = rhs;
                Ok(None)
            }
            (Self::Enum { r#enum: lhs }, Self::Const { r#const: rhs }) => {
                ensure!(
                    lhs.iter().any(|value| float_eq(*value, rhs)),
                    ResolveClosedDataTypeError::ConflictingConstEnumValue(
                        json!(rhs),
                        lhs.iter().map(|val| json!(*val)).collect(),
                    )
                );

                *self = Self::Const { r#const: rhs };
                Ok(None)
            }
            (Self::Const { r#const: lhs }, Self::Enum { r#enum: rhs }) => {
                ensure!(
                    rhs.iter().any(|value| float_eq(*value, *lhs)),
                    ResolveClosedDataTypeError::ConflictingConstEnumValue(
                        json!(*lhs),
                        rhs.iter().map(|val| json!(*val)).collect(),
                    )
                );

                Ok(None)
            }
            _ => todo!(),
        }
    }
}

pub(crate) fn validate_number_value(
    value: &JsonValue,
    schema: &NumberSchema,
) -> Result<(), Report<ConstraintError>> {
    if let JsonValue::Number(number) = value {
        schema.validate_value(number)
    } else {
        bail!(ConstraintError::InvalidType {
            actual: JsonSchemaValueType::from(value),
            expected: JsonSchemaValueType::Number,
        });
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
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

impl NumberConstraints {
    /// Validates the provided value against the number constraints.
    ///
    /// # Errors
    ///
    /// - [`Minimum`] if the value is less than the minimum value.
    /// - [`Maximum`] if the value is greater than the maximum value.
    /// - [`ExclusiveMinimum`] if the value is less than or equal to the minimum value.
    /// - [`ExclusiveMaximum`] if the value is greater than or equal to the maximum value.
    /// - [`MultipleOf`] if the value is not a multiple of the expected value.
    ///
    /// [`Minimum`]: NumberValidationError::Minimum
    /// [`Maximum`]: NumberValidationError::Maximum
    /// [`ExclusiveMinimum`]: NumberValidationError::ExclusiveMinimum
    /// [`ExclusiveMaximum`]: NumberValidationError::ExclusiveMaximum
    /// [`MultipleOf`]: NumberValidationError::MultipleOf
    pub fn validate_value(&self, number: f64) -> Result<(), Report<[NumberValidationError]>> {
        let mut status = ReportSink::new();

        if let Some(minimum) = self.minimum {
            if self.exclusive_minimum {
                if float_less_eq(number, minimum) {
                    status.capture(NumberValidationError::ExclusiveMinimum {
                        actual: number,
                        expected: minimum,
                    });
                }
            } else if float_less(number, minimum) {
                status.capture(NumberValidationError::Minimum {
                    actual: number,
                    expected: minimum,
                });
            }
        }

        if let Some(maximum) = self.maximum {
            if self.exclusive_maximum {
                if float_less_eq(maximum, number) {
                    status.capture(NumberValidationError::ExclusiveMaximum {
                        actual: number,
                        expected: maximum,
                    });
                }
            } else if float_less(maximum, number) {
                status.capture(NumberValidationError::Maximum {
                    actual: number,
                    expected: maximum,
                });
            }
        }

        if let Some(expected) = self.multiple_of {
            if !float_multiple_of(number, expected) {
                status.capture(NumberValidationError::MultipleOf {
                    actual: number,
                    expected,
                });
            }
        }

        status.finish()
    }

    /// Combines the current [`NumberConstraints`] with another one.
    ///
    /// Returns the remaining constraints that could not be combined.
    ///
    /// # Combined Constraints
    ///
    /// - [`minimum`] value is the maximum of the two values.
    /// - [`exclusive_minimum`] is set to `true` if either of the constraints has it set to `true`.
    /// - [`maximum`] value is the minimum of the two values.
    /// - [`exclusive_maximum`] is set to `true` if either of the constraints has it set to `true`.
    /// - [`multiple_of`] value is the maximum of the two values if they are multiples of each
    ///   other. If the values are not multiples of each other, the value from `other` will be
    ///   returned as the remainder.
    ///
    /// [`minimum`]: Self::minimum
    /// [`exclusive_minimum`]: Self::exclusive_minimum
    /// [`maximum`]: Self::maximum
    /// [`exclusive_maximum`]: Self::exclusive_maximum
    /// [`multiple_of`]: Self::multiple_of
    ///
    /// # Errors
    ///
    /// - [`ConflictingConstraints`] if the constraints exclude each other.
    ///
    /// `self` will not be modified if an error is returned.
    pub fn combine(
        &mut self,
        other: Self,
    ) -> Result<Option<Self>, Report<ResolveClosedDataTypeError>> {
        let mut remainder = None::<Self>;

        // We use a temporary value to store the combined constraints, and then assign it to self at
        // the end. This is done to avoid modifying self if the constraints cannot be combined.
        let value = Self {
            minimum: match self.minimum.zip(other.minimum) {
                Some((lhs, rhs)) => Some(if float_less_eq(lhs, rhs) { rhs } else { lhs }),
                None => self.minimum.or(other.minimum),
            },
            exclusive_minimum: self.exclusive_minimum || other.exclusive_minimum,
            maximum: match self.maximum.zip(other.maximum) {
                Some((lhs, rhs)) => Some(if float_less_eq(lhs, rhs) { lhs } else { rhs }),
                None => self.maximum.or(other.maximum),
            },
            exclusive_maximum: self.exclusive_maximum || other.exclusive_maximum,
            multiple_of: match self.multiple_of.zip(other.multiple_of) {
                Some((lhs, rhs)) if float_multiple_of(lhs, rhs) => Some(lhs),
                Some((lhs, rhs)) if float_multiple_of(rhs, lhs) => Some(rhs),
                Some((lhs, rhs)) => {
                    remainder.get_or_insert_default().multiple_of = Some(rhs);
                    Some(lhs)
                }
                None => self.multiple_of.or(other.multiple_of),
            },
        };

        if let Some((minimum, maximum)) = value.minimum.zip(value.maximum) {
            ensure!(
                float_less_eq(minimum, maximum),
                ResolveClosedDataTypeError::ConflictingConstraints(
                    ValueConstraints::Typed(SingleValueConstraints::Number(
                        NumberSchema::Constrained(Self {
                            minimum: Some(minimum),
                            ..Self::default()
                        }),
                    )),
                    ValueConstraints::Typed(SingleValueConstraints::Number(
                        NumberSchema::Constrained(Self {
                            maximum: Some(maximum),
                            ..Self::default()
                        }),
                    )),
                )
            );
        }

        *self = value;
        Ok(remainder)
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
        assert!(float_multiple_of(5.0, 5.0));
    }

    #[test]
    fn combine_with_non_conflicting_constraints() {
        let mut constraints1 = NumberConstraints {
            minimum: Some(1.0),
            exclusive_minimum: false,
            maximum: Some(10.0),
            exclusive_maximum: false,
            multiple_of: Some(2.0),
        };
        let constraints2 = NumberConstraints {
            minimum: Some(5.0),
            exclusive_minimum: true,
            maximum: Some(15.0),
            exclusive_maximum: true,
            multiple_of: Some(4.0),
        };

        let remainder = constraints1
            .combine(constraints2)
            .expect("Expected combined constraints");
        assert!(remainder.is_none());
        assert_eq!(constraints1.minimum, Some(5.0));
        assert!(constraints1.exclusive_minimum);
        assert_eq!(constraints1.maximum, Some(10.0));
        assert!(constraints1.exclusive_maximum);
        assert_eq!(constraints1.multiple_of, Some(4.0));
    }

    #[test]
    fn combine_with_conflicting_constraints() {
        let mut constraints1 = NumberConstraints {
            minimum: Some(6.0),
            exclusive_minimum: false,
            maximum: None,
            exclusive_maximum: false,
            multiple_of: None,
        };
        let constraints2 = NumberConstraints {
            minimum: None,
            exclusive_minimum: false,
            maximum: Some(5.0),
            exclusive_maximum: false,
            multiple_of: None,
        };

        let _: Report<_> = constraints1
            .combine(constraints2)
            .expect_err("Expected conflicting constraints");
    }

    #[test]
    fn combine_with_no_constraints() {
        let mut constraints1 = NumberConstraints::default();
        let constraints2 = NumberConstraints::default();

        let remainder = constraints1
            .combine(constraints2)
            .expect("Expected combined constraints");
        assert!(remainder.is_none());
        assert_eq!(constraints1.minimum, None);
        assert!(!constraints1.exclusive_minimum);
        assert_eq!(constraints1.maximum, None);
        assert!(!constraints1.exclusive_maximum);
        assert_eq!(constraints1.multiple_of, None);
    }

    #[test]
    fn combine_with_remainder() {
        let mut constraints1 = NumberConstraints {
            minimum: Some(1.0),
            exclusive_minimum: false,
            maximum: Some(10.0),
            exclusive_maximum: false,
            multiple_of: Some(2.0),
        };
        let constraints2 = NumberConstraints {
            minimum: Some(5.0),
            exclusive_minimum: true,
            maximum: Some(15.0),
            exclusive_maximum: true,
            multiple_of: Some(3.0),
        };

        let Some(remainder) = constraints1
            .combine(constraints2)
            .expect("Expected combined constraints")
        else {
            panic!("Expected remainder");
        };
        assert_eq!(remainder.multiple_of, Some(3.0));
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

        check_constraints(&number_schema, &json!(50));
        check_constraints_error(&number_schema, &json!(10), [
            ConstraintError::InvalidConstValue {
                actual: json!(10),
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

        check_constraints(&number_schema, &json!(50));
        check_constraints_error(&number_schema, &json!(10), [
            ConstraintError::InvalidEnumValue {
                actual: json!(10),
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
