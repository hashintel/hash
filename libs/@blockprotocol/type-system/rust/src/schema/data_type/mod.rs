mod constraint;

pub use self::{
    reference::DataTypeReference,
    validation::{DataTypeValidator, ValidateDataTypeError},
};

mod raw;
mod reference;
mod validation;

use core::fmt;

use error_stack::Report;
use regex::Regex;
use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value as JsonValue;

use crate::{
    schema::data_type::constraint::{extend_report, ConstraintError, StringFormat},
    url::VersionedUrl,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "kebab-case")]
pub enum JsonSchemaValueType {
    Null,
    Boolean,
    Number,
    Integer,
    String,
    Array,
    Object,
}

impl fmt::Display for JsonSchemaValueType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Null => fmt.write_str("null"),
            Self::Boolean => fmt.write_str("boolean"),
            Self::Number => fmt.write_str("number"),
            Self::Integer => fmt.write_str("integer"),
            Self::String => fmt.write_str("string"),
            Self::Array => fmt.write_str("array"),
            Self::Object => fmt.write_str("object"),
        }
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct DataTypeLabel {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<String>,
}

impl DataTypeLabel {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.left.is_none() && self.right.is_none()
    }
}

impl From<&JsonValue> for JsonSchemaValueType {
    fn from(value: &JsonValue) -> Self {
        match value {
            JsonValue::Null => Self::Null,
            JsonValue::Bool(_) => Self::Boolean,
            JsonValue::Number(_) => Self::Number,
            JsonValue::String(_) => Self::String,
            JsonValue::Array(_) => Self::Array,
            JsonValue::Object(_) => Self::Object,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(from = "raw::DataType")]
pub struct DataType {
    pub id: VersionedUrl,
    pub title: String,
    pub description: Option<String>,
    pub label: DataTypeLabel,

    // constraints for any types
    pub json_type: JsonSchemaValueType,
    pub const_value: Option<JsonValue>,
    pub enum_values: Vec<JsonValue>,

    // constraints for number types
    pub multiple_of: Option<f64>,
    pub maximum: Option<f64>,
    pub exclusive_maximum: bool,
    pub minimum: Option<f64>,
    pub exclusive_minimum: bool,

    // constraints for string types
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
    pub pattern: Option<Regex>,
    pub format: Option<StringFormat>,
}

impl DataType {
    /// Validates the given JSON value against the constraints of this data type.
    ///
    /// Returns a [`Report`] of any constraint errors found.
    ///
    /// # Errors
    ///
    /// Returns an error if the JSON value is not a valid instance of the data type.
    pub fn validate_constraints(&self, value: &JsonValue) -> Result<(), Report<ConstraintError>> {
        let mut result = Ok::<(), Report<ConstraintError>>(());

        if let Some(const_value) = &self.const_value {
            if value != const_value {
                extend_report!(
                    result,
                    ConstraintError::Const {
                        actual: value.clone(),
                        expected: const_value.clone()
                    }
                );
            }
        }
        if !self.enum_values.is_empty() && !self.enum_values.contains(value) {
            extend_report!(
                result,
                ConstraintError::Enum {
                    actual: value.clone(),
                    expected: self.enum_values.clone()
                }
            );
        }

        match value {
            JsonValue::Null => {
                constraint::check_null_constraints(self, &mut result);
            }
            JsonValue::Bool(boolean) => {
                constraint::check_boolean_constraints(*boolean, self, &mut result);
            }
            JsonValue::Number(number) => {
                if let Some(number) = number.as_f64() {
                    constraint::check_numeric_constraints(number, self, &mut result);
                } else {
                    extend_report!(
                        result,
                        ConstraintError::InsufficientPrecision {
                            actual: number.clone()
                        }
                    );
                }
            }
            JsonValue::String(string) => {
                constraint::check_string_constraints(string, self, &mut result);
            }
            JsonValue::Array(array) => {
                constraint::check_array_constraints(array, self, &mut result);
            }
            JsonValue::Object(object) => {
                constraint::check_object_constraints(object, self, &mut result);
            }
        }

        result
    }
}

impl Serialize for DataType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::DataType::from(self).serialize(serializer)
    }
}

#[cfg(test)]
mod tests {

    use serde_json::json;

    use super::*;
    use crate::utils::tests::{
        ensure_failed_deserialization, ensure_serialization_from_str, JsonEqualityCheck,
    };

    #[test]
    fn text() {
        ensure_serialization_from_str::<DataType>(
            graph_test_data::data_type::TEXT_V1,
            JsonEqualityCheck::Yes,
        );
    }

    #[test]
    fn number() {
        ensure_serialization_from_str::<DataType>(
            graph_test_data::data_type::NUMBER_V1,
            JsonEqualityCheck::Yes,
        );
    }

    #[test]
    fn boolean() {
        ensure_serialization_from_str::<DataType>(
            graph_test_data::data_type::BOOLEAN_V1,
            JsonEqualityCheck::Yes,
        );
    }

    #[test]
    fn null() {
        ensure_serialization_from_str::<DataType>(
            graph_test_data::data_type::NULL_V1,
            JsonEqualityCheck::Yes,
        );
    }

    #[test]
    fn object() {
        ensure_serialization_from_str::<DataType>(
            graph_test_data::data_type::OBJECT_V1,
            JsonEqualityCheck::Yes,
        );
    }

    #[test]
    fn empty_list() {
        ensure_serialization_from_str::<DataType>(
            graph_test_data::data_type::EMPTY_LIST_V1,
            JsonEqualityCheck::Yes,
        );
    }

    #[test]
    fn invalid_schema() {
        let invalid_schema_url = "https://blockprotocol.org/types/modules/graph/0.3/schema/foo";

        ensure_failed_deserialization::<DataType>(
            json!(
                {
                  "$schema": invalid_schema_url,
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  "title": "Text",
                  "description": "An ordered sequence of characters",
                  "type": "string"
                }
            ),
            &"unknown variant `https://blockprotocol.org/types/modules/graph/0.3/schema/foo`, expected `https://blockprotocol.org/types/modules/graph/0.3/schema/data-type`",
        );
    }

    #[test]
    fn invalid_id() {
        ensure_failed_deserialization::<DataType>(
            json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1.5",
                  "title": "Text",
                  "description": "An ordered sequence of characters",
                  "type": "string"
                }
            ),
            &"additional end content: .5",
        );
    }
}
