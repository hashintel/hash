use core::cmp;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportIteratorExt as _, bail};
use hash_codec::serde::constant::ConstBool;
use itertools::{EitherOrBoth, Itertools as _};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::{
    BooleanSchema, Constraint, ConstraintError, ConstraintValidator, JsonSchemaValueType,
    NumberSchema, StringSchema,
};
use crate::{
    knowledge::PropertyValue,
    ontology::data_type::schema::{ResolveClosedDataTypeError, ValueLabel},
};

#[derive(Debug, Error)]
pub enum ArrayValidationError {
    #[error(
        "The length of the array is too short, expected `{actual}` to be greater than or equal to \
         `{expected}`"
    )]
    MinItems { actual: usize, expected: usize },
    #[error(
        "The length of the array is too long, expected `{actual}` to be less than or equal to \
         `{expected}`"
    )]
    MaxItems { actual: usize, expected: usize },
    #[error("The elements in the array do not match the expected item constraints")]
    Items,
    #[error("The elements in the tuple do not match the expected item constraints")]
    PrefixItems,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum ArrayTypeTag {
    Array,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ArrayItemConstraints {
    Boolean,
    Number(NumberSchema),
    String(StringSchema),
}

impl Constraint for ArrayItemConstraints {
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        match (self, other) {
            (Self::Boolean, Self::Boolean) => Ok((Self::Boolean, None)),
            (Self::Number(lhs), Self::Number(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::Number(lhs), rhs.map(Self::Number))),
            (Self::String(lhs), Self::String(rhs)) => lhs
                .intersection(rhs)
                .map(|(lhs, rhs)| (Self::String(lhs), rhs.map(Self::String))),
            _ => bail!(ResolveClosedDataTypeError::IntersectedDifferentTypes),
        }
    }
}

impl ConstraintValidator<PropertyValue> for ArrayItemConstraints {
    type Error = ConstraintError;

    fn is_valid(&self, value: &PropertyValue) -> bool {
        match self {
            Self::Boolean => BooleanSchema.is_valid(value),
            Self::Number(schema) => schema.is_valid(value),
            Self::String(schema) => schema.is_valid(value),
        }
    }

    fn validate_value(&self, value: &PropertyValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Boolean => BooleanSchema.validate_value(value),
            Self::Number(schema) => schema.validate_value(value),
            Self::String(schema) => schema.validate_value(value),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrayItemsSchema {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "ValueLabel::is_empty")]
    pub label: ValueLabel,
    #[serde(flatten)]
    pub constraints: ArrayItemConstraints,
}

impl Constraint for ArrayItemsSchema {
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        let (combined, remainder) = self.constraints.intersection(other.constraints)?;
        let (description, label) = if self.description.is_none() && self.label.is_empty() {
            (other.description, other.label)
        } else {
            (self.description, self.label)
        };

        Ok((
            Self {
                description,
                label,
                constraints: combined,
            },
            remainder.map(|remainder| Self {
                constraints: remainder,
                description: None,
                label: ValueLabel::default(),
            }),
        ))
    }
}

#[cfg(target_arch = "wasm32")]
#[expect(
    dead_code,
    reason = "Used to export type to TypeScript to prevent Tsify generating interfaces"
)]
mod wasm {
    use super::*;

    #[derive(tsify::Tsify)]
    #[serde(untagged)]
    enum ArrayItemsSchema {
        Schema {
            #[serde(default, skip_serializing_if = "Option::is_none")]
            description: Option<String>,
            #[serde(default)]
            label: ValueLabel,
            #[serde(flatten)]
            constraints: ArrayItemConstraints,
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged, rename_all = "camelCase")]
pub enum ArraySchema {
    Constrained(Box<ArrayConstraints>),
    Tuple(TupleConstraints),
}

impl Constraint for ArraySchema {
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Constrained(lhs), Self::Constrained(rhs)) => {
                let (combined, remainder) = lhs.intersection(*rhs)?;
                (
                    Self::Constrained(Box::new(combined)),
                    remainder.map(|remainder| Self::Constrained(Box::new(remainder))),
                )
            }
            (Self::Tuple(lhs), Self::Constrained(rhs)) => {
                // Combining tuple and array constraints is not supported, yet
                (Self::Tuple(lhs), Some(Self::Constrained(rhs)))
            }
            (Self::Constrained(lhs), Self::Tuple(rhs)) => {
                // Combining tuple and array constraints is not supported, yet
                (Self::Constrained(lhs), Some(Self::Tuple(rhs)))
            }
            (Self::Tuple(lhs), Self::Tuple(rhs)) => {
                let (combined, remainder) = lhs.intersection(rhs)?;
                (Self::Tuple(combined), remainder.map(Self::Tuple))
            }
        })
    }
}

impl ConstraintValidator<PropertyValue> for ArraySchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &PropertyValue) -> bool {
        if let PropertyValue::Array(array) = value {
            self.is_valid(array.as_slice())
        } else {
            false
        }
    }

    fn validate_value(&self, value: &PropertyValue) -> Result<(), Report<ConstraintError>> {
        if let PropertyValue::Array(array) = value {
            self.validate_value(array.as_slice())
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Array,
            });
        }
    }
}

impl ConstraintValidator<[PropertyValue]> for ArraySchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &[PropertyValue]) -> bool {
        match self {
            Self::Constrained(constraints) => constraints.is_valid(value),
            Self::Tuple(constraints) => constraints.is_valid(value),
        }
    }

    fn validate_value(&self, value: &[PropertyValue]) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(value)
                .change_context(ConstraintError::ValueConstraint)?,
            Self::Tuple(constraints) => constraints
                .validate_value(value)
                .change_context(ConstraintError::ValueConstraint)?,
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrayConstraints {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<ArrayItemsSchema>,
}

impl Constraint for ArrayConstraints {
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        match (self.items, other.items) {
            (Some(lhs), Some(rhs)) => {
                let (combined, remainder) = lhs.intersection(rhs)?;

                Ok((
                    Self {
                        items: Some(combined),
                    },
                    remainder.map(|remainder| Self {
                        items: Some(remainder),
                    }),
                ))
            }
            (Some(items), None) | (None, Some(items)) => Ok((Self { items: Some(items) }, None)),
            (None, None) => Ok((Self { items: None }, None)),
        }
    }
}

impl ConstraintValidator<[PropertyValue]> for ArrayConstraints {
    type Error = [ArrayValidationError];

    fn is_valid(&self, value: &[PropertyValue]) -> bool {
        self.items
            .as_ref()
            .is_none_or(|items| value.iter().all(|value| items.constraints.is_valid(value)))
    }

    fn validate_value(
        &self,
        value: &[PropertyValue],
    ) -> Result<(), Report<[ArrayValidationError]>> {
        let mut status = ReportSink::new();

        if let Some(items) = &self.items {
            status.attempt(
                value
                    .iter()
                    .map(|value| items.constraints.validate_value(value))
                    .try_collect_reports::<Vec<()>>()
                    .change_context(ArrayValidationError::Items),
            );
        }

        status.finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TupleConstraints {
    #[cfg_attr(target_arch = "wasm32", tsify(type = "false"))]
    pub items: ConstBool<false>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[ArrayItemsSchema, ...ArrayItemsSchema[]]")
    )]
    pub prefix_items: Vec<ArrayItemsSchema>,
}

impl Constraint for TupleConstraints {
    fn intersection(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        let mut prefix_items =
            Vec::with_capacity(cmp::max(self.prefix_items.len(), other.prefix_items.len()));

        for zipped in self.prefix_items.iter().zip_longest(&other.prefix_items) {
            match zipped {
                EitherOrBoth::Both(lhs, rhs) => {
                    // We need to clone the constraints to fall back to the original values in case
                    // the intersection has a remainder. With a remainder it's not possible to
                    // create a combined value.
                    let (combined, None) = lhs.clone().intersection(rhs.clone())? else {
                        // With a remainder we can't create a combined value.
                        return Ok((self, Some(other)));
                    };

                    prefix_items.push(combined);
                }
                EitherOrBoth::Left(item) | EitherOrBoth::Right(item) => {
                    prefix_items.push(item.clone());
                }
            }
        }

        Ok((
            Self {
                items: ConstBool,
                prefix_items,
            },
            None,
        ))
    }
}

impl ConstraintValidator<[PropertyValue]> for TupleConstraints {
    type Error = [ArrayValidationError];

    fn is_valid(&self, value: &[PropertyValue]) -> bool {
        let num_values = value.len();
        let num_prefix_items = self.prefix_items.len();
        if num_values != num_prefix_items {
            return false;
        }

        self.prefix_items
            .iter()
            .zip(value)
            .all(|(schema, value)| schema.constraints.is_valid(value))
    }

    fn validate_value(
        &self,
        value: &[PropertyValue],
    ) -> Result<(), Report<[ArrayValidationError]>> {
        let mut status = ReportSink::new();

        let num_values = value.len();
        let num_prefix_items = self.prefix_items.len();
        if num_values != num_prefix_items {
            status.capture(if num_values < num_prefix_items {
                ArrayValidationError::MinItems {
                    actual: num_values,
                    expected: num_prefix_items,
                }
            } else {
                ArrayValidationError::MaxItems {
                    actual: num_values,
                    expected: num_prefix_items,
                }
            });
        }

        status.attempt(
            self.prefix_items
                .iter()
                .zip(value)
                .map(|(schema, value)| schema.constraints.validate_value(value))
                .try_collect_reports::<Vec<()>>()
                .change_context(ArrayValidationError::PrefixItems),
        );

        status.finish()
    }
}

#[cfg(test)]
mod tests {
    use hash_codec::numeric::Real;
    use serde_json::{from_value, json};

    use super::*;
    use crate::ontology::json_schema::{
        NumberValidationError, ValueConstraints,
        constraint::tests::{
            check_constraints, check_constraints_error, check_schema_intersection, read_schema,
        },
    };

    #[test]
    fn unconstrained() {
        let array_schema = read_schema(&json!({
            "type": "array",
        }));

        check_constraints(&array_schema, json!([]));
        check_constraints(&array_schema, json!([1, 2, 3]));
        check_constraints(&array_schema, json!([1, "2", true]));
    }

    #[test]
    fn simple_array() {
        let array_schema = read_schema(&json!({
            "type": "array",
            "items": {
                "type": "number",
                "description": "A number",
                "minimum": 0.0
            },
        }));

        check_constraints(&array_schema, json!([]));
        check_constraints(&array_schema, json!([1, 2, 3]));
        check_constraints_error(
            &array_schema,
            json!([1, "2", true]),
            [ArrayValidationError::Items],
        );
        check_constraints_error(
            &array_schema,
            json!([1, -2, 0]),
            [ArrayValidationError::Items],
        );
        check_constraints_error(
            &array_schema,
            json!([1, -2, -4]),
            [
                NumberValidationError::Minimum {
                    actual: Real::from(-2),
                    expected: Real::from(0),
                },
                NumberValidationError::Minimum {
                    actual: Real::from(-4),
                    expected: Real::from(0),
                },
            ],
        );
    }

    #[test]
    fn simple_tuple() {
        let array_schema = read_schema(&json!({
            "type": "array",
            "items": false,
            "prefixItems": [{
                "type": "number",
                "description": "A number",
                "maximum": 10.0
            }],
        }));

        check_constraints_error(
            &array_schema,
            json!([]),
            [ArrayValidationError::MinItems {
                actual: 0,
                expected: 1,
            }],
        );
        check_constraints_error(
            &array_schema,
            json!([1, 2, 3]),
            [ArrayValidationError::MaxItems {
                actual: 3,
                expected: 1,
            }],
        );
        check_constraints(&array_schema, json!([1]));
        check_constraints_error(
            &array_schema,
            json!([15]),
            [NumberValidationError::Maximum {
                actual: Real::from(15),
                expected: Real::from(10),
            }],
        );
    }

    #[test]
    fn empty_array() {
        let array_schema = read_schema(&json!({
            "type": "array",
            "items": false,
        }));

        check_constraints(&array_schema, json!([]));
        check_constraints_error(
            &array_schema,
            json!([null]),
            [ArrayValidationError::MaxItems {
                actual: 1,
                expected: 0,
            }],
        );
    }

    #[test]
    fn missing_type() {
        from_value::<ValueConstraints>(json!({
            "items": {"type": "number"},
        }))
        .expect_err("Deserialized number schema without type");
    }

    #[test]
    fn missing_nested_type() {
        from_value::<ValueConstraints>(json!({
            "type": "array",
            "items": {},
        }))
        .expect_err("Deserialized number schema without nested type");
    }

    #[test]
    fn additional_array_properties() {
        from_value::<ValueConstraints>(json!({
            "type": "array",
            "items": {"type": "number"},
            "additional": false,
        }))
        .expect_err("Deserialized array schema with additional properties");
    }

    #[test]
    fn additional_tuple_properties() {
        from_value::<ValueConstraints>(json!({
            "type": "array",
            "items": false,
            "additional": false,
        }))
        .expect_err("Deserialized array schema with additional properties");
    }

    #[test]
    fn additional_nested_properties() {
        from_value::<ValueConstraints>(json!({
            "type": "array",
            "items": {
                "type": "number",
                "additional": false,
            },
        }))
        .expect_err("Deserialized array schema with additional nested properties");
    }

    #[test]
    fn mixed() {
        from_value::<ValueConstraints>(json!({
            "type": "array",
            "items": {"type": "number"},
            "prefixItems": [{"type": "number"}],
        }))
        .expect_err("Deserialized array schema with mixed properties");
    }

    #[test]
    fn intersect_combinable_arrays() {
        check_schema_intersection(
            [
                json!({
                    "type": "array",
                    "items": {
                        "type": "string",
                        "minLength": 8,
                        "description": "A string with a minimum length of 8 characters",
                    },
                }),
                json!({
                    "type": "array",
                    "items": {
                        "type": "string",
                        "maxLength": 12,
                        "description": "A string with a maximum length of 12 characters",
                    },
                }),
            ],
            [json!({
                "type": "array",
                "items": {
                    "type": "string",
                    "minLength": 8,
                    "maxLength": 12,
                    "description": "A string with a minimum length of 8 characters",
                },
            })],
        );
    }

    #[test]
    fn intersect_non_combinable_arrays() {
        check_schema_intersection(
            [
                json!({
                    "type": "array",
                    "items": {
                        "type": "string",
                        "pattern": "ipv4",
                        "description": "An IPv4 address",
                    },
                }),
                json!({
                    "type": "array",
                    "items": {
                        "type": "string",
                        "pattern": "hostname",
                        "description": "A hostname",
                    },
                }),
            ],
            [
                json!({
                    "type": "array",
                    "items": {
                        "type": "string",
                        "pattern": "ipv4",
                        "description": "An IPv4 address",
                    },
                }),
                json!({
                    "type": "array",
                    "items": {
                        "type": "string",
                        "pattern": "hostname"
                    },
                }),
            ],
        );
    }

    #[test]
    fn intersect_array_and_tuple() {
        let array = json!({
            "type": "array",
            "items": {
                "type": "string",
                "minLength": 8,
                "description": "A string with a minimum length of 8 characters",
            },
        });
        let tuple = json!({
            "type": "array",
            "items": false,
            "prefixItems": [{
                "type": "string",
                "maxLength": 12,
                "description": "A string with a maximum length of 12 characters",
            }],
        });
        check_schema_intersection(
            [array.clone(), tuple.clone()],
            [array.clone(), tuple.clone()],
        );
        check_schema_intersection([tuple.clone(), array.clone()], [tuple, array]);
    }

    #[test]
    #[expect(clippy::too_many_lines)]
    fn intersect_combinable_tuples() {
        check_schema_intersection(
            [
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [{
                        "type": "string",
                        "minLength": 8,
                        "description": "A string with a minimum length of 8 characters",
                    }],
                }),
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [{
                        "type": "string",
                        "maxLength": 12,
                        "description": "A string with a maximum length of 12 characters",
                    }],
                }),
            ],
            [json!({
                "type": "array",
                "items": false,
                "prefixItems": [{
                    "type": "string",
                    "minLength": 8,
                    "maxLength": 12,
                    "description": "A string with a minimum length of 8 characters",
                }],
            })],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [
                        {
                            "type": "string",
                            "minLength": 8,
                            "description": "A string with a minimum length of 8 characters",
                        },
                        {
                            "type": "string",
                            "minLength": 8,
                            "description": "A string with a minimum length of 8 characters",
                        }
                    ],
                }),
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [{
                        "type": "string",
                        "maxLength": 12,
                        "description": "A string with a maximum length of 12 characters",
                    }],
                }),
            ],
            [json!({
                "type": "array",
                "items": false,
                "prefixItems": [
                    {
                        "type": "string",
                        "minLength": 8,
                        "maxLength": 12,
                        "description": "A string with a minimum length of 8 characters",
                    },
                    {
                        "type": "string",
                        "minLength": 8,
                        "description": "A string with a minimum length of 8 characters",
                    }
                ],
            })],
        );

        check_schema_intersection(
            [
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [{
                        "type": "string",
                        "minLength": 8,
                        "description": "A string with a minimum length of 8 characters",
                    }],
                }),
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [
                        {
                            "type": "string",
                            "maxLength": 12,
                            "description": "A string with a maximum length of 12 characters",
                        },
                        {
                            "type": "string",
                            "maxLength": 12,
                            "description": "A string with a maximum length of 12 characters",
                        }
                    ],
                }),
            ],
            [json!({
                "type": "array",
                "items": false,
                "prefixItems": [
                    {
                        "type": "string",
                        "minLength": 8,
                        "maxLength": 12,
                        "description": "A string with a minimum length of 8 characters",
                    },
                    {
                        "type": "string",
                        "maxLength": 12,
                        "description": "A string with a maximum length of 12 characters",
                    }
                ],
            })],
        );
    }

    #[test]
    fn intersect_non_combinable_tuples() {
        check_schema_intersection(
            [
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [{
                        "type": "string",
                        "pattern": "ipv4",
                        "description": "An IPv4 address",
                    }],
                }),
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [{
                        "type": "string",
                        "pattern": "hostname",
                        "description": "A hostname",
                    }],
                }),
            ],
            [
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [{
                        "type": "string",
                        "pattern": "ipv4",
                        "description": "An IPv4 address",
                    }],
                }),
                json!({
                    "type": "array",
                    "items": false,
                    "prefixItems": [{
                        "type": "string",
                        "pattern": "hostname",
                        "description": "A hostname",
                    }],
                }),
            ],
        );
    }
}
