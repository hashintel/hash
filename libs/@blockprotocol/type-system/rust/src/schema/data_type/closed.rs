use regex::Regex;
use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value as JsonValue;
use thiserror::Error;

use self::raw::RawDataType;
use crate::{
    schema::{
        data_type::{constraint::StringFormat, raw},
        DataType, DataTypeLabel, JsonSchemaValueType,
    },
    url::VersionedUrl,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(from = "RawDataType::<Self>")]
pub struct ClosedDataType {
    pub id: VersionedUrl,
    pub title: String,
    pub description: Option<String>,
    pub label: DataTypeLabel,

    pub all_of: Vec<Self>,

    // constraints for any type
    pub json_type: JsonSchemaValueType,
    pub const_value: Option<JsonValue>,
    pub enum_values: Vec<JsonValue>,

    // constraints for numbers
    pub multiple_of: Option<f64>,
    pub maximum: Option<f64>,
    pub exclusive_maximum: bool,
    pub minimum: Option<f64>,
    pub exclusive_minimum: bool,

    // constraints for strings
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
    pub pattern: Option<Regex>,
    pub format: Option<StringFormat>,
}

#[derive(Debug, Error)]
pub enum ClosedDataTypeError {
    #[error("Missing closed data type for {id}")]
    MissingClosedDataType { id: VersionedUrl },
}

impl ClosedDataType {
    /// Create a new closed data type from a data type.
    ///
    /// # Errors
    ///
    /// Returns an error if a parent data type is missing.
    pub fn new(data_type: DataType) -> Result<Self, ClosedDataTypeError> {
        Ok(Self {
            id: data_type.id,
            title: data_type.title,
            description: data_type.description,
            label: data_type.label,
            all_of: data_type
                .all_of
                .into_iter()
                .map(|parent| Err(ClosedDataTypeError::MissingClosedDataType { id: parent.url }))
                .collect::<Result<_, _>>()?,
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
        })
    }
}

impl Serialize for ClosedDataType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        raw::RawDataType::from(self).serialize(serializer)
    }
}
