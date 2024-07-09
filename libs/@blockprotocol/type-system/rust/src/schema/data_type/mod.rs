pub use self::{
    reference::DataTypeReference,
    validation::{DataTypeValidator, ValidateDataTypeError},
};

mod raw;
mod reference;
mod validation;

use core::fmt;
use std::collections::HashMap;

use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value as JsonValue;

use crate::url::VersionedUrl;

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
    pub json_type: JsonSchemaValueType,
    /// Properties which are not currently strongly typed.
    ///
    /// The data type meta-schema currently allows arbitrary, untyped properties. This is a
    /// catch-all field to store all non-typed data.
    pub additional_properties: HashMap<String, JsonValue>,
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
