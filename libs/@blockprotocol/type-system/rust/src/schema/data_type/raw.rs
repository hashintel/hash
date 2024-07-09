use alloc::borrow::Cow;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{schema::JsonSchemaValueType, url::VersionedUrl};

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase")]
pub struct DataType<'a> {
    #[serde(rename = "$schema")]
    pub schema: DataTypeSchemaTag,
    pub kind: DataTypeTag,
    #[serde(borrow = "'a", rename = "$id")]
    pub id: Cow<'a, VersionedUrl>,
    pub title: Cow<'a, str>,
    #[serde(default, skip_serializing_if = "Option::is_none", borrow = "'a")]
    pub description: Option<Cow<'a, str>>,
    #[serde(rename = "type")]
    pub json_type: JsonSchemaValueType,
    /// Properties which are not currently strongly typed.
    ///
    /// The data type meta-schema currently allows arbitrary, untyped properties. This is a
    /// catch-all field to store all non-typed data.
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Record<string, any>"))]
    #[serde(flatten)]
    pub additional_properties: HashMap<String, serde_json::Value>,
}

impl<'a> From<&'a super::DataType> for DataType<'a> {
    fn from(data_type: &'a super::DataType) -> Self {
        Self {
            schema: DataTypeSchemaTag::V3,
            kind: DataTypeTag::DataType,
            id: Cow::Borrowed(&data_type.id),
            title: Cow::Borrowed(&data_type.title),
            description: data_type.description.as_deref().map(Cow::Borrowed),
            json_type: data_type.json_type,
            additional_properties: data_type.additional_properties.clone(),
        }
    }
}

impl From<DataType<'_>> for super::DataType {
    fn from(data_type_repr: DataType) -> Self {
        Self {
            id: data_type_repr.id.into_owned(),
            title: data_type_repr.title.into_owned(),
            description: data_type_repr.description.map(Cow::into_owned),
            json_type: data_type_repr.json_type,
            additional_properties: data_type_repr.additional_properties,
        }
    }
}
