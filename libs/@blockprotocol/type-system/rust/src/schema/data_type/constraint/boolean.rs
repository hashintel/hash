use std::collections::HashSet;

use error_stack::Report;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

use crate::schema::DataTypeLabel;

#[derive(Debug, Error)]
pub enum BooleanValidationError {
    #[error(
        "the provided value is not equal to the expected value, expected `{actual}` to be equal \
         to `{expected}`"
    )]
    InvalidConstValue { actual: bool, expected: bool },
    #[error("the provided value is not one of the expected values, expected `{actual}` to be one of `{}`", json!(expected))]
    InvalidEnumValue {
        actual: bool,
        expected: HashSet<bool>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BooleanSchema {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "DataTypeLabel::is_empty")]
    pub label: DataTypeLabel,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#const: Option<bool>,
    #[serde(default, skip_serializing_if = "HashSet::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[boolean, ...boolean[]]"))]
    pub r#enum: HashSet<bool>,
}

impl BooleanSchema {
    pub fn validate_value(&self, boolean: bool) -> Result<(), Report<BooleanValidationError>> {
        let mut status = Ok::<(), Report<BooleanValidationError>>(());

        if let Some(expected) = &self.r#const {
            if *expected != boolean {
                extend_report!(
                    status,
                    BooleanValidationError::InvalidConstValue {
                        expected: *expected,
                        actual: boolean,
                    }
                );
            }
        }

        if !self.r#enum.is_empty() && !self.r#enum.contains(&boolean) {
            extend_report!(
                status,
                BooleanValidationError::InvalidEnumValue {
                    expected: self.r#enum.clone(),
                    actual: boolean,
                }
            );
        }

        status
    }
}
