use std::collections::HashMap;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::{
    schema::{data_type::constraint::StringFormat, DataTypeLabel, JsonSchemaValueType},
    url::VersionedUrl,
    DataType,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedDataTypeSchemaData {
    pub title: String,
    pub description: Option<String>,
    pub label: DataTypeLabel,
}

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "Only used in serde skip_serializing_if"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClosedDataType {
    pub schemas: HashMap<VersionedUrl, ClosedDataTypeSchemaData>,

    // constraints for any types
    #[serde(rename = "type")]
    pub json_type: JsonSchemaValueType,
    #[serde(rename = "const", default, skip_serializing_if = "Option::is_none")]
    pub const_value: Option<JsonValue>,
    #[serde(rename = "enum", default, skip_serializing_if = "Vec::is_empty")]
    pub enum_values: Vec<JsonValue>,

    // constraints for number types
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple_of: Option<f64>,
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
        skip_serializing_if = "Option::is_none",
        with = "codec::serde::regex::option"
    )]
    pub pattern: Option<Regex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<StringFormat>,
}

impl From<DataType> for ClosedDataType {
    fn from(data_type: DataType) -> Self {
        Self {
            schemas: HashMap::from([(
                data_type.id,
                ClosedDataTypeSchemaData {
                    title: data_type.title,
                    description: data_type.description,
                    label: data_type.label,
                },
            )]),

            json_type: data_type.json_type,
            const_value: data_type.const_value,
            enum_values: data_type.enum_values,
            multiple_of: data_type.multiple_of,
            maximum: data_type.maximum,
            exclusive_maximum: data_type.exclusive_maximum,
            minimum: data_type.minimum,
            exclusive_minimum: data_type.exclusive_minimum,
            min_length: data_type.min_length,
            max_length: data_type.max_length,
            pattern: data_type.pattern,
            format: data_type.format,
        }
    }
}
