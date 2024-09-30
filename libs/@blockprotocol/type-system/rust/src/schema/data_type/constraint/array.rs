use codec::serde::constant::ConstBool;
use error_stack::{Report, ReportSink, ResultExt as _, TryReportIteratorExt as _, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use thiserror::Error;

use crate::schema::{
    ConstraintError, JsonSchemaValueType, NumberSchema, StringSchema, ValueLabel,
    data_type::constraint::{
        boolean::validate_boolean_value, number::validate_number_value,
        string::validate_string_value,
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
    Boolean,
    Number(NumberSchema),
    String(StringSchema),
}

impl ArrayItemConstraints {
    pub fn validate_value(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Boolean => validate_boolean_value(value),
            Self::Number(schema) => validate_number_value(value, schema),
            Self::String(schema) => validate_string_value(value, schema),
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
    // TODO: Remove
    //   see https://linear.app/hash/issue/H-3368/remove-const-from-array-constraints
    Const { r#const: [JsonValue; 0] },
}

impl ArraySchema {
    /// Validates the provided value against the number schema.
    ///
    /// # Errors
    ///
    /// - [`ValueConstraint`] if the value does not match the expected constraints.
    ///
    /// [`ValueConstraint`]: ConstraintError::ValueConstraint
    pub fn validate_value(&self, array: &[JsonValue]) -> Result<(), Report<ConstraintError>> {
        match self {
            Self::Constrained(constraints) => constraints
                .validate_value(array)
                .change_context(ConstraintError::ValueConstraint)?,
            Self::Tuple(constraints) => constraints
                .validate_value(array)
                .change_context(ConstraintError::ValueConstraint)?,
            Self::Const { r#const } => {
                if array != *r#const {
                    bail!(ConstraintError::InvalidConstValue {
                        actual: JsonValue::Array(array.to_vec()),
                        expected: JsonValue::Array(r#const.to_vec()),
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
pub struct ArrayConstraints {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<ArrayItemsSchema>,
}

impl ArrayConstraints {
    /// Validates the provided value against the array constraints.
    ///
    /// # Errors
    ///
    /// - [`Items`] if the value does not match the expected item constraints.
    ///
    /// [`Items`]: ArrayValidationError::Items
    pub fn validate_value(
        &self,
        values: &[JsonValue],
    ) -> Result<(), Report<[ArrayValidationError]>> {
        let mut status = ReportSink::new();

        if let Some(items) = &self.items {
            status.attempt(
                values
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

impl TupleConstraints {
    /// Validates the provided value against the tuple constraints.
    ///
    /// # Errors
    ///
    /// - [`MinItems`] if the value has too few items.
    /// - [`MaxItems`] if the value has too many items.
    /// - [`PrefixItems`] if the value does not match the expected item constraints.
    ///
    /// [`MinItems`]: ArrayValidationError::MinItems
    /// [`MaxItems`]: ArrayValidationError::MaxItems
    /// [`PrefixItems`]: ArrayValidationError::PrefixItems
    pub fn validate_value(
        &self,
        values: &[JsonValue],
    ) -> Result<(), Report<[ArrayValidationError]>> {
        let mut status = ReportSink::new();

        let num_values = values.len();
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
                .zip(values)
                .map(|(schema, value)| schema.constraints.validate_value(value))
                .try_collect_reports::<Vec<()>>()
                .change_context(ArrayValidationError::PrefixItems),
        );

        status.finish()
    }
}

pub(crate) fn validate_array_value(
    value: &JsonValue,
    schema: &ArraySchema,
) -> Result<(), Report<ConstraintError>> {
    if let JsonValue::Array(string) = value {
        schema.validate_value(string)
    } else {
        bail!(ConstraintError::InvalidType {
            actual: JsonSchemaValueType::from(value),
            expected: JsonSchemaValueType::Array,
        });
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
