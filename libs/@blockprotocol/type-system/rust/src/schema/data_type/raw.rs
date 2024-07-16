use alloc::borrow::Cow;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{
    schema::{
        data_type::{constraint::StringFormat, DataTypeLabel},
        ClosedDataType, DataTypeReference, JsonSchemaValueType,
    },
    url::VersionedUrl,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase")]
pub enum DataTypeTag {
    DataType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase")]
pub enum DataTypeSchemaTag {
    #[serde(rename = "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type")]
    V3,
}

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "Only used in serde skip_serializing_if"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "D: Deserialize<'de>")
)]
pub struct RawDataType<'a, D: Clone> {
    #[serde(rename = "$schema")]
    pub schema: DataTypeSchemaTag,
    pub kind: DataTypeTag,
    #[serde(borrow = "'a", rename = "$id")]
    pub id: Cow<'a, VersionedUrl>,
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[D, ...D[]]"))]
    #[serde(default, skip_serializing_if = "<[_]>::is_empty", borrow = "'a")]
    pub all_of: Cow<'a, [D]>,
    pub title: Cow<'a, str>,
    #[serde(default, skip_serializing_if = "Option::is_none", borrow = "'a")]
    pub description: Option<Cow<'a, str>>,

    #[serde(
        default,
        skip_serializing_if = "DataTypeLabel::is_empty",
        borrow = "'a"
    )]
    pub label: Cow<'a, DataTypeLabel>,

    // constraints for any types
    #[serde(rename = "type")]
    pub json_type: JsonSchemaValueType,
    #[serde(
        rename = "const",
        default,
        skip_serializing_if = "Option::is_none",
        borrow = "'a"
    )]
    pub const_value: Option<Cow<'a, JsonValue>>,
    #[serde(
        rename = "enum",
        default,
        skip_serializing_if = "<[_]>::is_empty",
        borrow = "'a"
    )]
    #[cfg_attr(target_arch = "wasm32", tsify(type = "[JsonValue, ...JsonValue[]]"))]
    pub enum_values: Cow<'a, [JsonValue]>,

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
    #[cfg_attr(target_arch = "wasm32", tsify(type = "string"))]
    pub pattern: Option<Regex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<StringFormat>,
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use tsify::Tsify;

    use super::RawDataType;
    use crate::schema::DataTypeReference;

    #[cfg(target_arch = "wasm32")]
    #[derive(Tsify)]
    struct DataType<'a>(RawDataType<'a, DataTypeReference>);

    #[cfg(target_arch = "wasm32")]
    #[derive(Clone, Tsify)]
    struct ClosedDataType<'a>(RawDataType<'a, ClosedDataType<'a>>);
}

impl<'a> From<&'a super::DataType> for RawDataType<'a, DataTypeReference> {
    fn from(data_type: &'a super::DataType) -> Self {
        Self {
            schema: DataTypeSchemaTag::V3,
            kind: DataTypeTag::DataType,
            id: Cow::Borrowed(&data_type.id),
            all_of: Cow::Borrowed(&data_type.all_of),
            title: Cow::Borrowed(&data_type.title),
            description: data_type.description.as_deref().map(Cow::Borrowed),
            label: Cow::Borrowed(&data_type.label),
            json_type: data_type.json_type,
            const_value: data_type.const_value.as_ref().map(Cow::Borrowed),
            enum_values: Cow::Borrowed(&data_type.enum_values),
            multiple_of: data_type.multiple_of,
            maximum: data_type.maximum,
            exclusive_maximum: data_type.exclusive_maximum,
            minimum: data_type.minimum,
            exclusive_minimum: data_type.exclusive_minimum,
            min_length: data_type.min_length,
            max_length: data_type.max_length,
            pattern: data_type.pattern.clone(),
            format: data_type.format,
        }
    }
}

impl From<RawDataType<'_, DataTypeReference>> for super::DataType {
    fn from(data_type_repr: RawDataType<DataTypeReference>) -> Self {
        Self {
            id: data_type_repr.id.into_owned(),
            title: data_type_repr.title.into_owned(),
            description: data_type_repr.description.map(Cow::into_owned),
            all_of: data_type_repr.all_of.into_owned(),
            label: data_type_repr.label.into_owned(),
            json_type: data_type_repr.json_type,
            const_value: data_type_repr.const_value.map(Cow::into_owned),
            enum_values: data_type_repr.enum_values.into_owned(),
            multiple_of: data_type_repr.multiple_of,
            maximum: data_type_repr.maximum,
            exclusive_maximum: data_type_repr.exclusive_maximum,
            minimum: data_type_repr.minimum,
            exclusive_minimum: data_type_repr.exclusive_minimum,
            min_length: data_type_repr.min_length,
            max_length: data_type_repr.max_length,
            pattern: data_type_repr.pattern.clone(),
            format: data_type_repr.format,
        }
    }
}

impl<'a> From<&'a ClosedDataType> for RawDataType<'a, ClosedDataType> {
    fn from(data_type: &'a ClosedDataType) -> Self {
        Self {
            schema: DataTypeSchemaTag::V3,
            kind: DataTypeTag::DataType,
            id: Cow::Borrowed(&data_type.id),
            all_of: Cow::Borrowed(&data_type.all_of),
            title: Cow::Borrowed(&data_type.title),
            description: data_type.description.as_deref().map(Cow::Borrowed),
            label: Cow::Borrowed(&data_type.label),
            json_type: data_type.json_type,
            const_value: data_type.const_value.as_ref().map(Cow::Borrowed),
            enum_values: Cow::Borrowed(&data_type.enum_values),
            multiple_of: data_type.multiple_of,
            maximum: data_type.maximum,
            exclusive_maximum: data_type.exclusive_maximum,
            minimum: data_type.minimum,
            exclusive_minimum: data_type.exclusive_minimum,
            min_length: data_type.min_length,
            max_length: data_type.max_length,
            pattern: data_type.pattern.clone(),
            format: data_type.format,
        }
    }
}

impl From<RawDataType<'_, Self>> for ClosedDataType {
    fn from(data_type_repr: RawDataType<Self>) -> Self {
        Self {
            id: data_type_repr.id.into_owned(),
            title: data_type_repr.title.into_owned(),
            description: data_type_repr.description.map(Cow::into_owned),
            all_of: data_type_repr.all_of.into_owned(),
            label: data_type_repr.label.into_owned(),
            json_type: data_type_repr.json_type,
            const_value: data_type_repr.const_value.map(Cow::into_owned),
            enum_values: data_type_repr.enum_values.into_owned(),
            multiple_of: data_type_repr.multiple_of,
            maximum: data_type_repr.maximum,
            exclusive_maximum: data_type_repr.exclusive_maximum,
            minimum: data_type_repr.minimum,
            exclusive_minimum: data_type_repr.exclusive_minimum,
            min_length: data_type_repr.min_length,
            max_length: data_type_repr.max_length,
            pattern: data_type_repr.pattern.clone(),
            format: data_type_repr.format,
        }
    }
}
