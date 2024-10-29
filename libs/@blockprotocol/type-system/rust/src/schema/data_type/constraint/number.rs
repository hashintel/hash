use error_stack::{Report, ReportSink, ResultExt, TryReportIteratorExt, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Number as JsonNumber, Value as JsonValue, json};
use thiserror::Error;

use crate::schema::{
    ConstraintError, JsonSchemaValueType, SingleValueConstraints,
    data_type::{
        closed::ResolveClosedDataTypeError,
        constraint::{Constraint, ConstraintValidator, ValueConstraints},
    },
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

impl Constraint for NumberSchema {
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
                        ValueConstraints::Typed(SingleValueConstraints::Number(Self::Constrained(
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
                    .copied()
                    .collect::<Vec<_>>();

                match passed[..] {
                    [] => {
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
                                    ValueConstraints::Typed(SingleValueConstraints::Number(
                                        Self::Constrained(constraints.clone()),
                                    )),
                                ),
                            )?;

                        // This should only happen if `enum` is malformed and has no values. This
                        // should be caught by the schema validation, however, if this still happens
                        // we return an error as validating empty enum will always fail.
                        bail!(ResolveClosedDataTypeError::UnsatisfiedEnumConstraint(
                            ValueConstraints::Typed(SingleValueConstraints::Number(
                                Self::Constrained(constraints),
                            )),
                        ))
                    }
                    [r#const] => (Self::Const { r#const }, None),
                    [..] => (Self::Enum { r#enum: passed }, None),
                }
            }
            (Self::Const { r#const: lhs }, Self::Const { r#const: rhs }) => {
                if float_eq(lhs, rhs) {
                    (Self::Const { r#const: lhs }, None)
                } else {
                    bail!(ResolveClosedDataTypeError::ConflictingConstValues(
                        json!(lhs),
                        json!(rhs),
                    ))
                }
            }
            (Self::Enum { r#enum: lhs }, Self::Enum { r#enum: rhs }) => {
                let intersection = lhs
                    .iter()
                    .filter(|value| rhs.iter().any(|other| float_eq(**value, *other)))
                    .copied()
                    .collect::<Vec<_>>();

                match intersection[..] {
                    [] => bail!(ResolveClosedDataTypeError::ConflictingEnumValues(
                        lhs.iter().map(|val| json!(*val)).collect(),
                        rhs.iter().map(|val| json!(*val)).collect(),
                    )),
                    [r#const] => (Self::Const { r#const }, None),
                    [..] => (
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
                    r#enum.iter().any(|value| float_eq(*value, r#const)),
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

impl ConstraintValidator<JsonValue> for NumberSchema {
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

impl ConstraintValidator<JsonNumber> for NumberSchema {
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

impl ConstraintValidator<f64> for NumberSchema {
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
                ensure!(
                    r#enum.iter().any(|expected| float_eq(*value, *expected)),
                    ConstraintError::InvalidEnumValue {
                        actual: json!(*value),
                        expected: r#enum.iter().map(|value| json!(*value)).collect(),
                    }
                );
            }
        }
        Ok(())
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

impl Constraint for NumberConstraints {
    fn intersection(
        mut self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        let mut remainder = None::<Self>;

        self.minimum = match self.minimum.zip(other.minimum) {
            Some((lhs, rhs)) => Some(if float_less_eq(lhs, rhs) { rhs } else { lhs }),
            None => self.minimum.or(other.minimum),
        };
        self.exclusive_minimum = self.exclusive_minimum || other.exclusive_minimum;
        self.maximum = match self.maximum.zip(other.maximum) {
            Some((lhs, rhs)) => Some(if float_less_eq(lhs, rhs) { lhs } else { rhs }),
            None => self.maximum.or(other.maximum),
        };
        self.exclusive_maximum = self.exclusive_maximum || other.exclusive_maximum;
        self.multiple_of = match self.multiple_of.zip(other.multiple_of) {
            Some((lhs, rhs)) if float_multiple_of(lhs, rhs) => Some(lhs),
            Some((lhs, rhs)) if float_multiple_of(rhs, lhs) => Some(rhs),
            Some((lhs, rhs)) => {
                remainder.get_or_insert_default().multiple_of = Some(rhs);
                Some(lhs)
            }
            None => self.multiple_of.or(other.multiple_of),
        };

        if let Some((minimum, maximum)) = self.minimum.zip(self.maximum) {
            ensure!(
                float_less_eq(minimum, maximum),
                ResolveClosedDataTypeError::UnsatisfiableConstraint(ValueConstraints::Typed(
                    SingleValueConstraints::Number(NumberSchema::Constrained(Self {
                        minimum: Some(minimum),
                        maximum: Some(maximum),
                        ..Self::default()
                    }),)
                ),)
            );
        }

        Ok((self, remainder))
    }
}

impl ConstraintValidator<f64> for NumberConstraints {
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
        JsonSchemaValueType, NumberValidationError, SingleValueConstraints,
        data_type::{
            closed::ResolveClosedDataTypeError,
            constraint::{
                ValueConstraints,
                tests::{
                    check_constraints, check_constraints_error, check_schema_intersection,
                    check_schema_intersection_error, intersect_schemas, read_schema,
                },
            },
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
        let constraints1 = NumberConstraints {
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

        let (combined, None) = constraints1
            .intersection(constraints2)
            .expect("Expected combined constraints")
        else {
            panic!("Expected no remainder")
        };
        assert_eq!(combined.minimum, Some(5.0));
        assert!(combined.exclusive_minimum);
        assert_eq!(combined.maximum, Some(10.0));
        assert!(combined.exclusive_maximum);
        assert_eq!(combined.multiple_of, Some(4.0));
    }

    #[test]
    fn combine_with_conflicting_constraints() {
        let constraints1 = NumberConstraints {
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
            .intersection(constraints2)
            .expect_err("Expected conflicting constraints");
    }

    #[test]
    fn combine_with_no_constraints() {
        let constraints1 = NumberConstraints::default();
        let constraints2 = NumberConstraints::default();

        let (combined, None) = constraints1
            .intersection(constraints2)
            .expect("Could not combine constraints")
        else {
            panic!("Expected combined constraints");
        };
        assert_eq!(combined.minimum, None);
        assert!(!combined.exclusive_minimum);
        assert_eq!(combined.maximum, None);
        assert!(!combined.exclusive_maximum);
        assert_eq!(combined.multiple_of, None);
    }

    #[test]
    fn combine_with_remainder() {
        let constraints1 = NumberConstraints {
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

        let (_, Some(remainder)) = constraints1
            .intersection(constraints2)
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

    #[test]
    fn intersect_default() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                }),
                json!({
                    "type": "number",
                }),
            ],
            [json!({
                "type": "number",
            })],
        );
    }

    #[test]
    fn intersect_min_max_one() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                }),
            ],
            [json!({
                "type": "number",
                "minimum": 5.0,
                "maximum": 10.0,
            })],
        );
    }

    #[test]
    fn intersect_min_max_both() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "minimum": 7.0,
                    "maximum": 12.0,
                }),
            ],
            [json!({
                "type": "number",
                "minimum": 7.0,
                "maximum": 10.0,
            })],
        );
    }

    #[test]
    fn intersect_min_max_invalid() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "minimum": 12.0,
                    "maximum": 15.0,
                }),
            ],
            [ResolveClosedDataTypeError::UnsatisfiableConstraint(
                from_value(json!(
                    {
                        "type": "number",
                        "minimum": 12.0,
                        "maximum": 10.0,
                    }
                ))
                .expect("Failed to parse schema"),
            )],
        );
    }

    #[test]
    fn intersect_exclusive_min_max_one() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "exclusiveMinimum": true,
                    "maximum": 10.0,
                    "exclusiveMaximum": true,
                }),
                json!({
                    "type": "number",
                }),
            ],
            [json!({
                "type": "number",
                "minimum": 5.0,
                "exclusiveMinimum": true,
                "maximum": 10.0,
                "exclusiveMaximum": true,
            })],
        );
    }

    #[test]
    fn intersect_exclusive_min_max_both() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "exclusiveMinimum": true,
                    "maximum": 10.0,
                    "exclusiveMaximum": true,
                }),
                json!({
                    "type": "number",
                    "minimum": 7.0,
                    "exclusiveMinimum": true,
                    "maximum": 12.0,
                    "exclusiveMaximum": true,
                }),
            ],
            [json!({
                "type": "number",
                "minimum": 7.0,
                "exclusiveMinimum": true,
                "maximum": 10.0,
                "exclusiveMaximum": true,
            })],
        );
    }

    #[test]
    fn intersect_multiple_of_one() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "multipleOf": 5.0,
                }),
                json!({
                    "type": "number",
                }),
            ],
            [json!({
                "type": "number",
                "multipleOf": 5.0,
            })],
        );
    }

    #[test]
    fn intersect_multiple_of_both_different() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "multipleOf": 5.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 3.0,
                }),
            ],
            [
                json!({
                    "type": "number",
                    "multipleOf": 5.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 3.0,
                }),
            ],
        );
    }

    #[test]
    fn intersect_multiple_of_both_different_multiple() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "multipleOf": 5.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 10.0,
                }),
            ],
            [json!({
                "type": "number",
                "multipleOf": 10.0,
            })],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "multipleOf": 10.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 5.0,
                }),
            ],
            [json!({
                "type": "number",
                "multipleOf": 10.0,
            })],
        );
    }

    #[test]
    fn intersect_const_const_same() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
            ],
            [json!({
                "type": "number",
                "const": 5.0,
            })],
        );
    }

    #[test]
    fn intersect_const_const_different() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
                json!({
                    "type": "number",
                    "const": 10.0,
                }),
            ],
            [ResolveClosedDataTypeError::ConflictingConstValues(
                json!(5.0),
                json!(10.0),
            )],
        );
    }

    #[test]
    fn intersect_const_enum_compatible() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
                json!({
                    "type": "number",
                    "enum": [5.0, 10.0],
                }),
            ],
            [json!({
                "type": "number",
                "const": 5.0,
            })],
        );
    }

    #[test]
    fn intersect_const_enum_incompatible() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
                json!({
                    "type": "number",
                    "enum": [10.0, 15.0],
                }),
            ],
            [ResolveClosedDataTypeError::ConflictingConstEnumValue(
                json!(5.0),
                vec![json!(10.0), json!(15.0)],
            )],
        );
    }

    #[test]
    fn intersect_enum_enum_compatible_multi() {
        let intersection = intersect_schemas([
            json!({
                "type": "number",
                "enum": [5.0, 10.0, 15.0],
            }),
            json!({
                "type": "number",
                "enum": [5.0, 15.0, 20.0],
            }),
            json!({
                "type": "number",
                "enum": [0.0, 5.0, 15.0],
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
        let SingleValueConstraints::Number(NumberSchema::Enum { r#enum }) = &intersection[0] else {
            panic!("Expected string enum schema");
        };
        assert_eq!(r#enum.len(), 2);
        assert!(r#enum.contains(&5.0));
        assert!(r#enum.contains(&15.0));
    }

    #[test]
    fn intersect_enum_enum_compatible_single() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "enum": [5.0, 10.0, 15.0],
                }),
                json!({
                    "type": "number",
                    "enum": [5.0, 15.0, 20.0],
                }),
                json!({
                    "type": "number",
                    "enum": [5.0, 20.0],
                }),
            ],
            [json!({
                "type": "number",
                "const": 5.0,
            })],
        );
    }

    #[test]
    fn intersect_enum_enum_incompatible() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "number",
                    "enum": [5.0, 10.0, 15.0],
                }),
                json!({
                    "type": "number",
                    "enum": [20.0, 25.0, 30.0],
                }),
            ],
            [ResolveClosedDataTypeError::ConflictingEnumValues(
                vec![json!(5.0), json!(10.0), json!(15.0)],
                vec![json!(20.0), json!(25.0), json!(30.0)],
            )],
        );
    }

    #[test]
    fn intersect_const_constraint_compatible() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
                json!({
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 10.0,
                }),
            ],
            [json!({
                "type": "number",
                "const": 5.0,
            })],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
            ],
            [json!({
                "type": "number",
                "const": 5.0,
            })],
        );
    }

    #[test]
    fn intersect_const_constraint_incompatible() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
                json!({
                    "type": "number",
                    "minimum": 10.0,
                    "maximum": 15.0,
                }),
            ],
            [ResolveClosedDataTypeError::UnsatisfiedConstraint(
                json!(5.0),
                from_value(json!({
                    "type": "number",
                    "minimum": 10.0,
                    "maximum": 15.0,
                }))
                .expect("Failed to parse schema"),
            )],
        );

        check_schema_intersection_error(
            [
                json!({
                    "type": "number",
                    "minimum": 10.0,
                    "maximum": 15.0,
                }),
                json!({
                    "type": "number",
                    "const": 5.0,
                }),
            ],
            [ResolveClosedDataTypeError::UnsatisfiedConstraint(
                json!(5.0),
                from_value(json!({
                    "type": "number",
                    "minimum": 10.0,
                    "maximum": 15.0,
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
                    "type": "number",
                    "enum": [5.0, 10.0, 15.0],
                }),
                json!({
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 10.0,
                    "exclusiveMaximum": true,
                }),
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "maximum": 15.0,
                }),
            ],
            [json!({
                "type": "number",
                "const": 5.0,
            })],
        );
    }

    #[test]
    fn intersect_enum_constraint_compatible_multi() {
        let intersection = intersect_schemas([
            json!({
                "type": "number",
                "enum": [5.0, 10.0, 15.0],
            }),
            json!({
                "type": "number",
                "minimum": 10.0,
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
        let SingleValueConstraints::Number(NumberSchema::Enum { r#enum }) = &intersection[0] else {
            panic!("Expected string enum schema");
        };
        assert_eq!(r#enum.len(), 2);
        assert!(r#enum.contains(&10.0));
        assert!(r#enum.contains(&15.0));
    }

    #[test]
    fn intersect_enum_constraint_incompatible() {
        check_schema_intersection_error(
            [
                json!({
                    "type": "number",
                    "enum": [5.0, 10.0, 15.0],
                }),
                json!({
                    "type": "number",
                    "minimum": 20.0,
                }),
            ],
            [
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraint(
                    from_value(json!({
                        "type": "number",
                        "minimum": 20.0,
                    }))
                    .expect("Failed to parse schema"),
                ),
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(json!(5.0)),
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(json!(10.0)),
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(json!(15.0)),
            ],
        );
    }

    #[test]
    fn intersect_mixed() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 5.0,
                }),
                json!({
                    "type": "number",
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 3.0,
                }),
                json!({
                    "type": "number",
                    "maximum": 15.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 10.0,
                }),
                json!({
                    "type": "number",
                    "minimum": 7.0,
                    "maximum": 20.0,
                }),
            ],
            [
                json!({
                    "type": "number",
                    "minimum": 7.0,
                    "maximum": 10.0,
                    "multipleOf": 10.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 3.0,
                }),
            ],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 5.0,
                }),
                json!({
                    "type": "number",
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "maximum": 15.0,
                }),
                json!({
                    "type": "number",
                    "const": 10.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 10.0,
                }),
                json!({
                    "type": "number",
                    "minimum": 10.0,
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "multipleOf": 2.0,
                }),
            ],
            [json!({
                "type": "number",
                "const": 10.0,
            })],
        );
    }
}
