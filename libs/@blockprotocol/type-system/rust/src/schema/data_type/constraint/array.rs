use codec::serde::constant::ConstBool;
use error_stack::{Report, ReportSink, ResultExt, TryReportIteratorExt, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::schema::{
    ConstraintError, JsonSchemaValueType, NumberSchema, StringSchema, ValueLabel,
    data_type::{
        closed::ResolveClosedDataTypeError,
        constraint::{Constraint, ConstraintValidator, boolean::BooleanSchema},
    },
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
    Boolean(BooleanSchema),
    Number(NumberSchema),
    String(StringSchema),
}

impl Constraint for ArrayItemConstraints {
    fn combine(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        match (self, other) {
            (Self::Boolean(lhs), Self::Boolean(rhs)) => lhs
                .combine(rhs)
                .map(|(lhs, rhs)| (Self::Boolean(lhs), rhs.map(Self::Boolean))),
            (Self::Number(lhs), Self::Number(rhs)) => lhs
                .combine(rhs)
                .map(|(lhs, rhs)| (Self::Number(lhs), rhs.map(Self::Number))),
            (Self::String(lhs), Self::String(rhs)) => lhs
                .combine(rhs)
                .map(|(lhs, rhs)| (Self::String(lhs), rhs.map(Self::String))),
            _ => bail!(ResolveClosedDataTypeError::IntersectedDifferentTypes),
        }
    }
}

impl ConstraintValidator<JsonValue> for ArrayItemConstraints {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        match self {
            Self::Boolean(schema) => schema.is_valid(value),
            Self::Number(schema) => schema.is_valid(value),
            Self::String(schema) => schema.is_valid(value),
        }
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Boolean(schema) => schema.validate_value(value),
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
    Constrained(ArrayConstraints),
    Tuple(TupleConstraints),
}

impl Constraint for ArraySchema {
    fn combine(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        Ok(match (self, other) {
            (Self::Constrained(lhs), Self::Constrained(rhs)) => {
                let (combined, remainder) = lhs.combine(rhs)?;
                (
                    Self::Constrained(combined),
                    remainder.map(Self::Constrained),
                )
            }
            (Self::Tuple(lhs), Self::Constrained(rhs)) => {
                // TODO: Implement folding for array constraints
                //   see https://linear.app/hash/issue/H-3429/implement-folding-for-array-constraints
                (Self::Tuple(lhs), Some(Self::Constrained(rhs)))
            }
            (Self::Constrained(lhs), Self::Tuple(rhs)) => {
                // TODO: Implement folding for array constraints
                //   see https://linear.app/hash/issue/H-3429/implement-folding-for-array-constraints
                (Self::Constrained(lhs), Some(Self::Tuple(rhs)))
            }
            (Self::Tuple(lhs), Self::Tuple(rhs)) => {
                let (combined, remainder) = lhs.combine(rhs)?;
                (Self::Tuple(combined), remainder.map(Self::Tuple))
            }
        })
    }
}

impl ConstraintValidator<JsonValue> for ArraySchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &JsonValue) -> bool {
        if let JsonValue::Array(array) = value {
            self.is_valid(array.as_slice())
        } else {
            false
        }
    }

    fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        if let JsonValue::Array(array) = value {
            self.validate_value(array.as_slice())
        } else {
            bail!(ConstraintError::InvalidType {
                actual: JsonSchemaValueType::from(value),
                expected: JsonSchemaValueType::Array,
            });
        }
    }
}

impl ConstraintValidator<[JsonValue]> for ArraySchema {
    type Error = ConstraintError;

    fn is_valid(&self, value: &[JsonValue]) -> bool {
        match self {
            Self::Constrained(constraints) => constraints.is_valid(value),
            Self::Tuple(constraints) => constraints.is_valid(value),
        }
    }

    fn validate_value(&self, value: &[JsonValue]) -> Result<(), Report<ConstraintError>> {
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
    fn combine(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        // TODO: Implement folding for array constraints
        //   see https://linear.app/hash/issue/H-3429/implement-folding-for-array-constraints
        Ok((self, Some(other)))
    }
}

impl ConstraintValidator<[JsonValue]> for ArrayConstraints {
    type Error = [ArrayValidationError];

    fn is_valid(&self, value: &[JsonValue]) -> bool {
        self.items.as_ref().map_or(true, |items| {
            value.iter().all(|value| items.constraints.is_valid(value))
        })
    }

    fn validate_value(&self, value: &[JsonValue]) -> Result<(), Report<[ArrayValidationError]>> {
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
    fn combine(
        self,
        other: Self,
    ) -> Result<(Self, Option<Self>), Report<ResolveClosedDataTypeError>> {
        // TODO: Implement folding for array constraints
        //   see https://linear.app/hash/issue/H-3429/implement-folding-for-array-constraints
        Ok((self, Some(other)))
    }
}

impl ConstraintValidator<[JsonValue]> for TupleConstraints {
    type Error = [ArrayValidationError];

    fn is_valid(&self, value: &[JsonValue]) -> bool {
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

    fn validate_value(&self, value: &[JsonValue]) -> Result<(), Report<[ArrayValidationError]>> {
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
    use serde_json::{from_value, json};

    use super::*;
    use crate::schema::{
        NumberValidationError,
        data_type::constraint::{
            ValueConstraints,
            tests::{check_constraints, check_constraints_error, read_schema},
        },
    };

    #[test]
    fn unconstrained() {
        let array_schema = read_schema(&json!({
            "type": "array",
        }));

        check_constraints(&array_schema, &json!([]));
        check_constraints(&array_schema, &json!([1, 2, 3]));
        check_constraints(&array_schema, &json!([1, "2", true]));
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

        check_constraints(&array_schema, &json!([]));
        check_constraints(&array_schema, &json!([1, 2, 3]));
        check_constraints_error(&array_schema, &json!([1, "2", true]), [
            ArrayValidationError::Items,
        ]);
        check_constraints_error(&array_schema, &json!([1, -2, 0]), [
            ArrayValidationError::Items,
        ]);
        check_constraints_error(&array_schema, &json!([1, -2, -4]), [
            NumberValidationError::Minimum {
                actual: -2.0,
                expected: 0.0,
            },
            NumberValidationError::Minimum {
                actual: -4.0,
                expected: 0.0,
            },
        ]);
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

        check_constraints_error(&array_schema, &json!([]), [
            ArrayValidationError::MinItems {
                actual: 0,
                expected: 1,
            },
        ]);
        check_constraints_error(&array_schema, &json!([1, 2, 3]), [
            ArrayValidationError::MaxItems {
                actual: 3,
                expected: 1,
            },
        ]);
        check_constraints(&array_schema, &json!([1]));
        check_constraints_error(&array_schema, &json!([15]), [
            NumberValidationError::Maximum {
                actual: 15.0,
                expected: 10.0,
            },
        ]);
    }

    #[test]
    fn empty_array() {
        let array_schema = read_schema(&json!({
            "type": "array",
            "items": false,
        }));

        check_constraints(&array_schema, &json!([]));
        check_constraints_error(&array_schema, &json!([null]), [
            ArrayValidationError::MaxItems {
                actual: 1,
                expected: 0,
            },
        ]);
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
}
