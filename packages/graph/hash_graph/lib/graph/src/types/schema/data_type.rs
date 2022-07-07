use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::types::schema::Uri;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum DataTypeTag {
    DataType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataType {
    kind: DataTypeTag,
    #[serde(rename = "$id")]
    id: Uri,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(rename = "type")]
    json_type: String,
    /// Properties, which are not strongly typed.
    ///
    /// The data type meta-schema currently allows arbitrary, untyped properties. This is a
    /// catch-all field to store all non-typed data.
    #[serde(flatten)]
    additional_properties: HashMap<String, serde_json::Value>,
}

impl DataType {
    /// Creates a new `DataType`.
    pub fn new(
        id: Uri,
        title: impl Into<String>,
        description: impl Into<Option<String>>,
        ty: impl Into<String>,
        additional_properties: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            kind: DataTypeTag::DataType,
            id,
            title: title.into(),
            description: description.into(),
            ty: ty.into(),
            additional_properties,
        }
    }

    #[must_use]
    pub const fn id(&self) -> &Uri {
        &self.id
    }

    #[must_use]
    pub fn title(&self) -> &str {
        &self.title
    }

    #[must_use]
    pub fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    #[must_use]
    pub fn json_type(&self) -> &str {
        &self.json_type
    }

    #[must_use]
    pub const fn additional_properties(&self) -> &HashMap<String, serde_json::Value> {
        &self.additional_properties
    }

    #[must_use]
    pub fn additional_properties_mut(&mut self) -> &mut HashMap<String, serde_json::Value> {
        &mut self.additional_properties
    }

    /// Returns the primitive `Text` data type.
    #[must_use]
    pub fn text() -> Self {
        Self::new(
            Uri::new("https://blockprotocol.org/types/@blockprotocol/data-type/text"),
            "Text",
            "An ordered sequence of characters".to_owned(),
            "string",
            HashMap::default(),
        )
    }

    /// Returns the primitive `Number` data type.
    #[must_use]
    pub fn number() -> Self {
        Self::new(
            Uri::new("https://blockprotocol.org/types/@blockprotocol/data-type/number"),
            "Number",
            "An arithmetical value (in the Real number system)".to_owned(),
            "number",
            HashMap::default(),
        )
    }

    /// Returns the primitive `Boolean` data type.
    #[must_use]
    pub fn boolean() -> Self {
        Self::new(
            Uri::new("https://blockprotocol.org/types/@blockprotocol/data-type/boolean"),
            "Boolean",
            "A True or False value".to_owned(),
            "boolean",
            HashMap::default(),
        )
    }

    /// Returns the primitive `Null` data type.
    #[must_use]
    pub fn null() -> Self {
        Self::new(
            Uri::new("https://blockprotocol.org/types/@blockprotocol/data-type/null"),
            "Null",
            "A placeholder value representing 'nothing'".to_owned(),
            "null",
            HashMap::default(),
        )
    }

    /// Returns the primitive `Object` data type.
    #[must_use]
    pub fn object() -> Self {
        Self::new(
            Uri::new("https://blockprotocol.org/types/@blockprotocol/data-type/object"),
            "Object",
            "A plain JSON object with no pre-defined structure".to_owned(),
            "object",
            HashMap::default(),
        )
    }

    /// Returns the primitive `Empty List` data type.
    #[must_use]
    pub fn empty_list() -> Self {
        Self::new(
            Uri::new("https://blockprotocol.org/types/@blockprotocol/data-type/empty-list"),
            "Empty List",
            "An Empty List".to_owned(),
            "array",
            [("const".to_owned(), json!([]))].into_iter().collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn validate(data_type: &DataType, json: serde_json::Value) -> Result<(), serde_json::Error> {
        let data_type_json = serde_json::to_value(&json)?;
        assert_eq!(data_type_json, json);

        let data_type_from_json = serde_json::from_value(json)?;
        assert_eq!(data_type, &data_type_from_json);
        Ok(())
    }

    #[test]
    fn text() {
        validate(
            &DataType::text(),
            json!({
              "kind": "dataType",
              "$id": "https://blockprotocol.org/types/@blockprotocol/data-type/text",
              "title": "Text",
              "description": "An ordered sequence of characters",
              "type": "string"
            }),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn number() {
        validate(
            &DataType::number(),
            json!({
              "kind": "dataType",
              "$id": "https://blockprotocol.org/types/@blockprotocol/data-type/number",
              "title": "Number",
              "description": "An arithmetical value (in the Real number system)",
              "type": "number"
            }),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn boolean() {
        validate(
            &DataType::boolean(),
            json!({
              "kind": "dataType",
              "$id": "https://blockprotocol.org/types/@blockprotocol/data-type/boolean",
              "title": "Boolean",
              "description": "A True or False value",
              "type": "boolean"
            }),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn null() {
        validate(
            &DataType::null(),
            json!({
              "kind": "dataType",
              "$id": "https://blockprotocol.org/types/@blockprotocol/data-type/null",
              "title": "Null",
              "description": "A placeholder value representing 'nothing'",
              "type": "null"
            }),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn object() {
        validate(
            &DataType::object(),
            json!({
              "kind": "dataType",
              "$id": "https://blockprotocol.org/types/@blockprotocol/data-type/object",
              "title": "Object",
              "description": "A plain JSON object with no pre-defined structure",
              "type": "object"
            }),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn empty_list() {
        validate(
            &DataType::empty_list(),
            json!({
              "kind": "dataType",
              "$id": "https://blockprotocol.org/types/@blockprotocol/data-type/empty-list",
              "title": "Empty List",
              "description": "An Empty List",
              "type": "array",
              "const": []
            }),
        )
        .expect("Invalid data type");
    }
}
