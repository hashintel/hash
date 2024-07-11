use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::schema::{
    data_type::constraint::StringFormat, DataType, DataTypeLabel, JsonSchemaValueType,
};

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "Only used in serde skip_serializing_if"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedDataType {
    #[serde(default, skip_serializing_if = "DataTypeLabel::is_empty")]
    pub label: DataTypeLabel,

    // constraints for any types
    #[serde(rename = "type")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[JsonSchemaValueType]"))]
    pub json_type: Vec<JsonSchemaValueType>,
    #[serde(rename = "enum", default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[JsonValue, ...JsonValue[]]"))]
    pub enum_values: Vec<JsonValue>,

    // constraints for number types
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[number, ...number[]]"))]
    pub multiple_of: Vec<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximum: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub exclusive_maximum: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub exclusive_minimum: bool,

    // constraints for string types
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,
    #[serde(
        default,
        skip_serializing_if = "Vec::is_empty",
        with = "codec::serde::regex::iter"
    )]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[string, ...string[]]"))]
    pub pattern: Vec<Regex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<StringFormat>,
}

impl ClosedDataType {
    #[must_use]
    pub fn new(data_type: DataType) -> Self {
        Self {
            label: data_type.label,
            json_type: vec![data_type.json_type],
            // We don't need to check if `enum` matches `const` as this is done in the validation
            // step
            enum_values: data_type
                .const_value
                .map_or(data_type.enum_values, |const_value| vec![const_value]),
            multiple_of: data_type.multiple_of.map(|x| vec![x]).unwrap_or_default(),
            maximum: data_type.maximum,
            exclusive_maximum: data_type.exclusive_maximum,
            minimum: data_type.minimum,
            exclusive_minimum: data_type.exclusive_minimum,
            min_length: data_type.min_length,
            max_length: data_type.max_length,
            pattern: data_type.pattern.map(|x| vec![x]).unwrap_or_default(),
            format: data_type.format,
        }
    }
}

#[cfg(test)]
mod tests {
    use regex::Regex;
    use serde_json::{json, Value as JsonValue};

    use crate::{
        schema::{ClosedDataType, DataType, DataTypeValidator},
        utils::tests::{ensure_validation, ensure_validation_from_str, JsonEqualityCheck},
    };

    #[tokio::test]
    async fn empty_list() {
        let empty_list = ensure_validation_from_str::<DataType, _>(
            graph_test_data::data_type::EMPTY_LIST_V1,
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        let closed_schema = ClosedDataType::new(empty_list.into_inner());
        assert_eq!(closed_schema.enum_values, [JsonValue::Array(Vec::new())]);
    }

    #[tokio::test]
    async fn zip_code() {
        let zip_code_pattern = "^[0-9]{5}(?:-[0-9]{4})?$";
        let zip_code = ensure_validation::<ClosedDataType, _>(
            json!({
                "type": ["string"],
                "pattern": [zip_code_pattern],
            }),
            DataTypeValidator,
            JsonEqualityCheck::Yes,
        )
        .await;

        assert_eq!(
            zip_code
                .pattern
                .iter()
                .map(Regex::to_string)
                .collect::<Vec<_>>(),
            [zip_code_pattern]
        );
    }
}
