use error_stack::Report;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use thiserror::Error;

use crate::schema::{
    data_type::constraint::{ConstraintError, ValueConstraints},
    DataTypeLabel,
};

#[derive(Debug, Error)]
pub enum ArrayValidationError {
    #[error(
        "the provided value is not equal to the expected value, expected `{}` to be equal \
         to `{}`", json!(actual), json!(expected)
    )]
    InvalidConstValue {
        actual: Vec<JsonValue>,
        expected: Vec<JsonValue>,
    },
    #[error("the provided value is not one of the expected values, expected `{}` to be one of `{}`", json!(actual), json!(expected))]
    InvalidEnumValue {
        actual: Vec<JsonValue>,
        expected: Vec<Vec<JsonValue>>,
    },

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
#[serde(untagged, deny_unknown_fields)]
pub enum ItemsConstraints {
    Boolean(bool),
    Value(Box<ValueConstraints>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArraySchema {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "DataTypeLabel::is_empty")]
    pub label: DataTypeLabel,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "JsonValue[]"))]
    pub r#const: Option<Vec<JsonValue>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[JsonValue[], ...JsonValue[][]]")
    )]
    pub r#enum: Vec<Vec<JsonValue>>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_items: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_items: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "ValueConstraints | boolean"))]
    pub items: Option<ItemsConstraints>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "[ValueConstraints, ...ValueConstraints[]]")
    )]
    pub prefix_items: Vec<ValueConstraints>,
}

impl ArraySchema {
    pub fn validate_value(&self, values: &[JsonValue]) -> Result<(), Report<ArrayValidationError>> {
        let mut validation_status = Ok::<(), Report<ArrayValidationError>>(());

        if let Some(expected) = &self.r#const {
            if expected != values {
                extend_report!(
                    validation_status,
                    ArrayValidationError::InvalidConstValue {
                        expected: expected.clone(),
                        actual: values.to_owned(),
                    }
                );
            }
        }

        if !self.r#enum.is_empty() && !self.r#enum.iter().any(|expected| expected == values) {
            extend_report!(
                validation_status,
                ArrayValidationError::InvalidEnumValue {
                    expected: self.r#enum.clone(),
                    actual: values.to_owned(),
                }
            );
        }

        let num_values = values.len();

        let mut values = values.iter();

        let mut item_status = Ok::<(), Report<ConstraintError>>(());
        for (value, constraint) in values
            .by_ref()
            .take(self.prefix_items.len())
            .zip(&self.prefix_items)
        {
            if let Err(error) = constraint.validate_value(value) {
                extend_report!(item_status, error);
            }
        }

        let expected_num_items = self.prefix_items.len().max(self.min_items.unwrap_or(0));
        if num_values < expected_num_items {
            extend_report!(
                validation_status,
                ArrayValidationError::MinItems {
                    actual: num_values,
                    expected: expected_num_items,
                }
            );
        }
        if let Some(max_items) = self.max_items {
            if num_values > max_items {
                extend_report!(
                    validation_status,
                    ArrayValidationError::MaxItems {
                        actual: num_values,
                        expected: max_items,
                    }
                );
            }
        }

        match &self.items {
            None | Some(ItemsConstraints::Boolean(true)) => {}
            Some(ItemsConstraints::Boolean(false)) => {
                if values.next().is_some() {
                    extend_report!(
                        validation_status,
                        ArrayValidationError::MaxItems {
                            actual: num_values,
                            expected: self.prefix_items.len(),
                        }
                    );
                }
            }
            Some(ItemsConstraints::Value(items)) => {
                for value in values {
                    if let Err(error) = items.validate_value(value) {
                        extend_report!(item_status, error);
                    }
                }
            }
        }

        if let Err(error) = item_status {
            extend_report!(
                validation_status,
                error.change_context(ArrayValidationError::Items)
            );
        }

        validation_status
    }
}
