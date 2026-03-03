use alloc::collections::BTreeSet;
use core::cmp;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportIteratorExt as _, bail, ensure};
use hash_codec::numeric::Real;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::{Constraint, ConstraintError, ConstraintValidator, JsonSchemaValueType};
use crate::{
    knowledge::PropertyValue,
    ontology::{
        data_type::schema::ResolveClosedDataTypeError,
        json_schema::{SingleValueConstraints, ValueConstraints},
    },
};

#[derive(Debug, Error)]
pub enum NumberValidationError {
    #[error(
        "the provided value is not greater than or equal to the minimum value, expected \
         `{actual}` to be greater than or equal to `{expected}`"
    )]
    Minimum { actual: Real, expected: Real },
    #[error(
        "the provided value is not less than or equal to the maximum value, expected `{actual}` \
         to be less than or equal to `{expected}`"
    )]
    Maximum { actual: Real, expected: Real },
    #[error(
        "the provided value is not greater than the minimum value, expected `{actual}` to be \
         strictly greater than `{expected}`"
    )]
    ExclusiveMinimum { actual: Real, expected: Real },
    #[error(
        "the provided value is not less than the maximum value, expected `{actual}` to be \
         strictly less than `{expected}`"
    )]
    ExclusiveMaximum { actual: Real, expected: Real },
    #[error(
        "the provided value is not a multiple of the expected value, expected `{actual}` to be a \
         multiple of `{expected}`"
    )]
    MultipleOf { actual: Real, expected: Real },
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
    Enum {
        #[cfg_attr(target_arch = "wasm32", tsify(type = "[number, ...number[]]"))]
        #[serde(deserialize_with = "hash_codec::serde::unique_vec::btree")]
        r#enum: Vec<Real>,
    },
}

fn float_multiple_of(lhs: &Real, rhs: &Real) -> bool {
    if *rhs == Real::from(0) {
        return false;
    }
    lhs % rhs == Real::from(0)
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
            (Self::Enum { r#enum }, Self::Constrained(constraints))
            | (Self::Constrained(constraints), Self::Enum { r#enum }) => {
                // We use the fast way to filter the values that pass the constraints and collect
                // them. In most cases this will result in at least one value
                // passing the constraints.
                let passed = r#enum
                    .iter()
                    .filter(|&value| constraints.is_valid(value))
                    .cloned()
                    .collect::<Vec<_>>();

                if passed.is_empty() {
                    // We now properly capture errors to return it to the caller.
                    let () = r#enum
                        .into_iter()
                        .map(|value| {
                            constraints.validate_value(&value).change_context(
                                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(
                                    PropertyValue::Number(value),
                                ),
                            )
                        })
                        .try_collect_reports()
                        .change_context_lazy(|| {
                            ResolveClosedDataTypeError::UnsatisfiedEnumConstraint(
                                ValueConstraints::Typed(Box::new(SingleValueConstraints::Number(
                                    Self::Constrained(constraints.clone()),
                                ))),
                            )
                        })?;

                    // This should only happen if `enum` is malformed and has no values. This
                    // should be caught by the schema validation, however, if this still happens
                    // we return an error as validating empty enum will always fail.
                    bail!(ResolveClosedDataTypeError::UnsatisfiedEnumConstraint(
                        ValueConstraints::Typed(Box::new(SingleValueConstraints::Number(
                            Self::Constrained(constraints)
                        ),)),
                    ))
                }

                (Self::Enum { r#enum: passed }, None)
            }
            (Self::Enum { r#enum: lhs }, Self::Enum { r#enum: rhs }) => {
                // We use a `BTreeSet` to find the actual intersection of the two enums. It's not
                // required to clone the values.
                let lhs_set = lhs.iter().collect::<BTreeSet<_>>();
                let rhs_set = rhs.iter().collect::<BTreeSet<_>>();
                let intersection = lhs_set.intersection(&rhs_set).collect::<BTreeSet<_>>();

                ensure!(
                    !intersection.is_empty(),
                    ResolveClosedDataTypeError::ConflictingEnumValues(
                        lhs.into_iter().map(PropertyValue::Number).collect(),
                        rhs.into_iter().map(PropertyValue::Number).collect(),
                    )
                );

                (
                    Self::Enum {
                        r#enum: lhs
                            .into_iter()
                            .filter(|value| rhs.contains(value))
                            .collect(),
                    },
                    None,
                )
            }
        })
    }
}

impl ConstraintValidator<PropertyValue> for NumberSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &PropertyValue) -> bool {
        if let PropertyValue::Number(number) = value {
            self.is_valid(number)
        } else {
            false
        }
    }

    fn validate_value(&self, value: &PropertyValue) -> Result<(), Report<ConstraintError>> {
        if let PropertyValue::Number(number) = value {
            self.validate_value(number)
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Number,
            });
        }
    }
}

impl ConstraintValidator<Real> for NumberSchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &Real) -> bool {
        match self {
            Self::Constrained(constraints) => constraints.is_valid(value),
            Self::Enum { r#enum } => r#enum.iter().any(|expected| value == expected),
        }
    }

    fn validate_value(&self, value: &Real) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(value)
                .change_context(ConstraintError::ValueConstraint)?,
            Self::Enum { r#enum } => {
                ensure!(
                    r#enum.iter().any(|expected| value == expected),
                    ConstraintError::InvalidEnumValue {
                        actual: PropertyValue::Number(value.clone()),
                        expected: r#enum
                            .iter()
                            .map(|number| PropertyValue::Number(number.clone()))
                            .collect(),
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
    pub minimum: Option<Real>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclusive_minimum: Option<Real>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximum: Option<Real>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclusive_maximum: Option<Real>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple_of: Option<Real>,
}

impl Constraint for NumberConstraints {
    fn intersection(
        mut self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        let mut remainder = None::<Self>;

        // Handle minimum constraints - take the more restrictive one
        self.minimum = match (self.minimum, other.minimum) {
            (Some(lhs), Some(rhs)) => Some(cmp::max(lhs, rhs)),
            (lhs, rhs) => lhs.or(rhs),
        };

        // Handle exclusive minimum constraints - take the more restrictive one
        self.exclusive_minimum = match (self.exclusive_minimum, other.exclusive_minimum) {
            (Some(lhs), Some(rhs)) => Some(cmp::max(lhs, rhs)),
            (lhs, rhs) => lhs.or(rhs),
        };

        // Keep only the more restrictive of minimum and exclusive_minimum if both exist
        if let (Some(minimum), Some(exclusive_minimum)) = (&self.minimum, &self.exclusive_minimum) {
            if exclusive_minimum < minimum {
                self.exclusive_minimum = None; // Regular minimum is more restrictive
            } else {
                self.minimum = None; // Exclusive minimum is more restrictive
            }
        }

        // Handle maximum constraints - take the more restrictive one
        self.maximum = match (self.maximum, other.maximum) {
            (Some(lhs), Some(rhs)) => Some(cmp::min(lhs, rhs)),
            (lhs, rhs) => lhs.or(rhs),
        };

        // Handle exclusive maximum constraints - take the more restrictive one
        self.exclusive_maximum = match (self.exclusive_maximum, other.exclusive_maximum) {
            (Some(lhs), Some(rhs)) => Some(cmp::min(lhs, rhs)),
            (lhs, rhs) => lhs.or(rhs),
        };

        // Keep only the more restrictive of maximum and exclusive_maximum if both exist
        if let (Some(maximum), Some(exclusive_maximum)) = (&self.maximum, &self.exclusive_maximum) {
            if exclusive_maximum > maximum {
                self.exclusive_maximum = None; // Regular maximum is more restrictive
            } else {
                self.maximum = None; // Exclusive maximum is more restrictive
            }
        }

        // Handle multipleOf constraints
        self.multiple_of = match (self.multiple_of, other.multiple_of) {
            (Some(lhs), Some(rhs)) if float_multiple_of(&lhs, &rhs) => Some(lhs), /* lhs is more restrictive */
            (Some(lhs), Some(rhs)) if float_multiple_of(&rhs, &lhs) => Some(rhs), /* rhs is more restrictive */
            (Some(lhs), Some(rhs)) => {
                // Neither is a multiple of the other, keep both separately
                remainder.get_or_insert_default().multiple_of = Some(rhs);
                Some(lhs)
            }
            (lhs, rhs) => lhs.or(rhs), // If only one exists, use it
        };

        // Validate that the resulting range is satisfiable
        let min_value = self.minimum.as_ref().or(self.exclusive_minimum.as_ref());
        let max_value = self.maximum.as_ref().or(self.exclusive_maximum.as_ref());

        if let Some((minimum, maximum)) = min_value.zip(max_value) {
            ensure!(
                match (
                    self.exclusive_minimum.is_some(),
                    self.exclusive_maximum.is_some(),
                ) {
                    (true, true) => minimum < maximum, // For exclusive bounds on both ends
                    _ => minimum <= maximum,           // Otherwise
                },
                ResolveClosedDataTypeError::UnsatisfiableConstraint(ValueConstraints::Typed(
                    Box::new(SingleValueConstraints::Number(NumberSchema::Constrained(
                        Self {
                            minimum: self.minimum,
                            maximum: self.maximum,
                            exclusive_minimum: self.exclusive_minimum,
                            exclusive_maximum: self.exclusive_maximum,
                            multiple_of: None,
                        }
                    )))
                ))
            );
        }

        Ok((self, remainder))
    }
}

impl ConstraintValidator<Real> for NumberConstraints {
    type Error = [NumberValidationError];

    fn is_valid(&self, value: &Real) -> bool {
        if let Some(minimum) = &self.minimum
            && value < minimum
        {
            return false;
        }

        if let Some(exclusive_minimum) = &self.exclusive_minimum
            && value <= exclusive_minimum
        {
            return false;
        }

        if let Some(maximum) = &self.maximum
            && value > maximum
        {
            return false;
        }

        if let Some(exclusive_maximum) = &self.exclusive_maximum
            && value >= exclusive_maximum
        {
            return false;
        }

        if let Some(expected) = &self.multiple_of
            && !float_multiple_of(value, expected)
        {
            return false;
        }

        true
    }

    fn validate_value(&self, value: &Real) -> Result<(), Report<[NumberValidationError]>> {
        let mut status = ReportSink::new();

        if let Some(minimum) = &self.minimum
            && value < minimum
        {
            status.capture(NumberValidationError::Minimum {
                actual: value.clone(),
                expected: minimum.clone(),
            });
        }

        if let Some(exclusive_minimum) = &self.exclusive_minimum
            && value <= exclusive_minimum
        {
            status.capture(NumberValidationError::ExclusiveMinimum {
                actual: value.clone(),
                expected: exclusive_minimum.clone(),
            });
        }

        if let Some(maximum) = &self.maximum
            && value > maximum
        {
            status.capture(NumberValidationError::Maximum {
                actual: value.clone(),
                expected: maximum.clone(),
            });
        }

        if let Some(exclusive_maximum) = &self.exclusive_maximum
            && value >= exclusive_maximum
        {
            status.capture(NumberValidationError::ExclusiveMaximum {
                actual: value.clone(),
                expected: exclusive_maximum.clone(),
            });
        }

        if let Some(expected) = &self.multiple_of
            && !float_multiple_of(value, expected)
        {
            status.capture(NumberValidationError::MultipleOf {
                actual: value.clone(),
                expected: expected.clone(),
            });
        }

        status.finish()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{from_value, json};

    use super::*;
    use crate::ontology::json_schema::constraint::tests::{
        check_constraints, check_constraints_error, check_schema_intersection,
        check_schema_intersection_error, read_schema,
    };

    #[test]
    fn compare_modulo() {
        assert!(float_multiple_of(&Real::from(10), &Real::from(5)));
        assert!(!float_multiple_of(&Real::from(10), &Real::from(3)));
        assert!(float_multiple_of(
            &Real::from(10),
            &Real::from_natural(25, -1)
        ));
        assert!(float_multiple_of(
            &Real::from_natural(1, 9),
            &Real::from_natural(1, 6)
        ));
        assert!(float_multiple_of(
            &Real::from_natural(1, -5),
            &Real::from_natural(1, -6)
        ));
        assert!(float_multiple_of(&Real::from(-10), &Real::from(-5)));
        assert!(float_multiple_of(&Real::from(-10), &Real::from(5)));
        assert!(!float_multiple_of(&Real::from(10), &Real::from(0)));
        assert!(float_multiple_of(&Real::from(0), &Real::from(5)));
        assert!(!float_multiple_of(
            &Real::from_natural(1, -1),
            &Real::from_natural(3, -2)
        ));
        assert!(float_multiple_of(&Real::from(5), &Real::from(5)));
    }

    #[test]
    fn combine_with_non_conflicting_constraints() {
        let constraints1 = NumberConstraints {
            minimum: Some(Real::from(1)),
            exclusive_minimum: None,
            maximum: Some(Real::from(10)),
            exclusive_maximum: None,
            multiple_of: Some(Real::from(2)),
        };
        let constraints2 = NumberConstraints {
            minimum: None,
            exclusive_minimum: Some(Real::from(5)),
            maximum: None,
            exclusive_maximum: Some(Real::from(15)),
            multiple_of: Some(Real::from(4)),
        };

        let (combined, None) = constraints1
            .intersection(constraints2)
            .expect("Expected combined constraints")
        else {
            panic!("Expected no remainder")
        };
        assert_eq!(combined.minimum, None);
        assert_eq!(combined.exclusive_minimum, Some(Real::from(5)));
        assert_eq!(combined.maximum, Some(Real::from(10)));
        assert_eq!(combined.exclusive_maximum, None);
        assert_eq!(combined.multiple_of, Some(Real::from(4)));
    }

    #[test]
    fn combine_with_conflicting_constraints() {
        let constraints1 = NumberConstraints {
            minimum: Some(Real::from(6)),
            exclusive_minimum: None,
            maximum: None,
            exclusive_maximum: None,
            multiple_of: None,
        };
        let constraints2 = NumberConstraints {
            minimum: None,
            exclusive_minimum: None,
            maximum: Some(Real::from(5)),
            exclusive_maximum: None,
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
        assert_eq!(combined.exclusive_minimum, None);
        assert_eq!(combined.maximum, None);
        assert_eq!(combined.exclusive_maximum, None);
        assert_eq!(combined.multiple_of, None);
    }

    #[test]
    fn combine_with_remainder() {
        let constraints1 = NumberConstraints {
            minimum: Some(Real::from(1)),
            exclusive_minimum: None,
            maximum: Some(Real::from(10)),
            exclusive_maximum: None,
            multiple_of: Some(Real::from(2)),
        };
        let constraints2 = NumberConstraints {
            minimum: None,
            exclusive_minimum: Some(Real::from(5)),
            maximum: None,
            exclusive_maximum: Some(Real::from(15)),
            multiple_of: Some(Real::from(3)),
        };

        let (_, Some(remainder)) = constraints1
            .intersection(constraints2)
            .expect("Expected combined constraints")
        else {
            panic!("Expected remainder");
        };
        assert_eq!(remainder.multiple_of, Some(Real::from(3)));
    }

    #[test]
    fn unconstrained() {
        let number_schema = read_schema(&json!({
            "type": "number",
        }));

        check_constraints(&number_schema, json!(0));
        check_constraints_error(
            &number_schema,
            json!("NaN"),
            [ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: JsonSchemaValueType::Number,
            }],
        );
    }

    #[test]
    fn simple_number() {
        let number_schema = read_schema(&json!({
            "type": "number",
            "minimum": 0.0,
            "maximum": 10.0,
        }));

        check_constraints(&number_schema, json!(0));
        check_constraints(&number_schema, json!(10));
        check_constraints_error(
            &number_schema,
            json!("2"),
            [ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: JsonSchemaValueType::Number,
            }],
        );
        check_constraints_error(
            &number_schema,
            json!(-2),
            [NumberValidationError::Minimum {
                actual: Real::from(-2),
                expected: Real::from(0),
            }],
        );
        check_constraints_error(
            &number_schema,
            json!(15),
            [NumberValidationError::Maximum {
                actual: Real::from(15),
                expected: Real::from(10),
            }],
        );
    }

    #[test]
    fn simple_number_exclusive() {
        let number_schema = read_schema(&json!({
            "type": "number",
            "exclusiveMinimum": 0.0,
            "exclusiveMaximum": 10.0,
        }));

        check_constraints(&number_schema, json!(0.1));
        check_constraints(&number_schema, json!(0.9));
        check_constraints_error(
            &number_schema,
            json!("2"),
            [ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: JsonSchemaValueType::Number,
            }],
        );
        check_constraints_error(
            &number_schema,
            json!(0),
            [NumberValidationError::ExclusiveMinimum {
                actual: Real::from(0),
                expected: Real::from(0),
            }],
        );
        check_constraints_error(
            &number_schema,
            json!(10),
            [NumberValidationError::ExclusiveMaximum {
                actual: Real::from(10),
                expected: Real::from(10),
            }],
        );
    }

    #[test]
    fn multiple_of() {
        let number_schema = ValueConstraints::Typed(Box::new(SingleValueConstraints::Number(
            NumberSchema::Constrained(NumberConstraints {
                minimum: None,
                exclusive_minimum: None,
                maximum: None,
                exclusive_maximum: None,
                multiple_of: Some(Real::from_natural(1, -1)),
            }),
        )));

        number_schema
            .validate_value(&PropertyValue::Number(Real::from_natural(1, -1)))
            .expect("value should be valid");
        number_schema
            .validate_value(&PropertyValue::Number(Real::from_natural(9, -1)))
            .expect("value should be valid");

        check_constraints_error(
            &number_schema,
            json!("2"),
            [ConstraintError::InvalidType {
                actual: JsonSchemaValueType::String,
                expected: JsonSchemaValueType::Number,
            }],
        );
        check_constraints_error(
            &number_schema,
            json!(0.11),
            [NumberValidationError::MultipleOf {
                actual: Real::from_natural(11, -2),
                expected: Real::from_natural(1, -1),
            }],
        );
    }

    #[test]
    fn enumeration() {
        let number_schema = read_schema(&json!({
            "type": "number",
            "enum": [20.0],
        }));

        check_constraints(&number_schema, json!(20.0));
        check_constraints_error(
            &number_schema,
            json!(10.0),
            [ConstraintError::InvalidEnumValue {
                actual: PropertyValue::Number(Real::from(10)),
                expected: vec![PropertyValue::Number(Real::from(20))],
            }],
        );
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
            "enum": [50],
            "minimum": 0,
        }))
        .expect_err("Deserialized number schema with mixed properties");
    }

    #[test]
    fn duplicate_enum_values() {
        from_value::<ValueConstraints>(json!({
            "type": "number",
            "enum": [50, 50],
        }))
        .expect_err("Deserialized number schema with duplicate enum values");
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
                    "exclusiveMinimum": 5.0,
                    "exclusiveMaximum": 10.0,
                }),
                json!({
                    "type": "number",
                }),
            ],
            [json!({
                "type": "number",
                "exclusiveMinimum": 5.0,
                "exclusiveMaximum": 10.0,
            })],
        );
    }

    #[test]
    fn intersect_exclusive_min_max_both() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "exclusiveMinimum": 5.0,
                    "exclusiveMaximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "exclusiveMinimum": 7.0,
                    "exclusiveMaximum": 12.0,
                }),
            ],
            [json!({
                "type": "number",
                "exclusiveMinimum": 7.0,
                "exclusiveMaximum": 10.0,
            })],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "exclusiveMinimum": 5.0,
                    "exclusiveMaximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "minimum": 7.0,
                    "maximum": 8.0,
                }),
            ],
            [json!({
                "type": "number",
                "minimum": 7.0,
                "maximum": 8.0,
            })],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "exclusiveMinimum": 7.0,
                    "exclusiveMaximum": 8.0,
                }),
            ],
            [json!({
                "type": "number",
                "exclusiveMinimum": 7.0,
                "exclusiveMaximum": 8.0,
            })],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "maximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "exclusiveMinimum": 5.0,
                    "exclusiveMaximum": 10.0,
                }),
            ],
            [json!({
                "type": "number",
                "exclusiveMinimum": 5.0,
                "exclusiveMaximum": 10.0,
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
    fn intersect_enum_enum_compatible_multi() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "enum": [15.0, 5.0, 10.0],
                }),
                json!({
                    "type": "number",
                    "enum": [5.0, 15.0, 20.0],
                }),
                json!({
                    "type": "number",
                    "enum": [0.0, 5.0, 15.0],
                }),
            ],
            [json!({
                "type": "number",
                "enum": [15.0, 5.0],
            })],
        );
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
                "enum": [5.0],
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
                from_value(json!([5.0, 10.0, 15.0])).expect("Failed to parse enum"),
                from_value(json!([20.0, 25.0, 30.0])).expect("Failed to parse enum"),
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
                    "exclusiveMaximum": 10.0,
                }),
                json!({
                    "type": "number",
                    "minimum": 5.0,
                    "maximum": 15.0,
                }),
            ],
            [json!({
                "type": "number",
                "enum": [5.0],
            })],
        );
    }

    #[test]
    fn intersect_enum_constraint_compatible_multi() {
        check_schema_intersection(
            [
                json!({
                    "type": "number",
                    "enum": [5.0, 10.0, 15.0],
                }),
                json!({
                    "type": "number",
                    "minimum": 10.0,
                }),
            ],
            [json!({
                "type": "number",
                "enum": [10.0, 15.0],
            })],
        );
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
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(
                    PropertyValue::Number(Real::from(5)),
                ),
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(
                    PropertyValue::Number(Real::from(10)),
                ),
                ResolveClosedDataTypeError::UnsatisfiedEnumConstraintVariant(
                    PropertyValue::Number(Real::from(15)),
                ),
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
                    "enum": [10.0, 20.0],
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
                "enum": [10.0],
            })],
        );
    }
}
