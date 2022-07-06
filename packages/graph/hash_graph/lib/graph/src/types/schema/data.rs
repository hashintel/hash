use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::types::schema::{Uri, Validate, ValidationError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    try_from = "DataTypeRepr",
    tag = "kind",
    rename = "dataType",
    rename_all = "camelCase"
)]
pub struct DataType {
    #[serde(rename = "$id")]
    id: Uri,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(rename = "type")]
    ty: String,
    #[serde(flatten)]
    additional_properties: HashMap<String, serde_json::Value>,
}

impl DataType {
    /// Creates a new `DataType` without validating.
    #[must_use]
    pub fn new_unchecked(
        id: Uri,
        title: impl Into<String>,
        description: impl Into<Option<String>>,
        ty: impl Into<String>,
        additional_properties: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            id,
            title: title.into(),
            description: description.into(),
            ty: ty.into(),
            additional_properties,
        }
    }

    /// Creates a new `DataType`.
    ///
    /// # Errors
    ///
    /// - [`ValidationError`] if validation is failing.
    pub fn new(
        id: Uri,
        title: impl Into<String>,
        description: impl Into<Option<String>>,
        ty: impl Into<String>,
        additional_properties: HashMap<String, serde_json::Value>,
    ) -> Result<Self, ValidationError> {
        let data_type = Self::new_unchecked(id, title, description, ty, additional_properties);
        data_type.validate()?;
        Ok(data_type)
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
    pub fn ty(&self) -> &str {
        &self.ty
    }

    #[must_use]
    pub const fn additional_properties(&self) -> &HashMap<String, serde_json::Value> {
        &self.additional_properties
    }

    #[must_use]
    pub fn additional_properties_mut(&mut self) -> &mut HashMap<String, serde_json::Value> {
        &mut self.additional_properties
    }

    /// Returns the predefined text data type.
    #[must_use]
    pub fn text() -> Self {
        Self::new_unchecked(
            Uri::new_unchecked("https://blockprotocol.org/types/@blockprotocol/data-type/text"),
            "Text",
            "An ordered sequence of characters".to_owned(),
            "string",
            HashMap::default(),
        )
    }

    /// Returns the predefined number data type.
    #[must_use]
    pub fn number() -> Self {
        Self::new_unchecked(
            Uri::new_unchecked("https://blockprotocol.org/types/@blockprotocol/data-type/number"),
            "Number",
            "An arithmetical value (in the Real number system)".to_owned(),
            "number",
            HashMap::default(),
        )
    }

    /// Returns the predefined boolean data type.
    #[must_use]
    pub fn boolean() -> Self {
        Self::new_unchecked(
            Uri::new_unchecked("https://blockprotocol.org/types/@blockprotocol/data-type/boolean"),
            "Boolean",
            "A True or False value".to_owned(),
            "boolean",
            HashMap::default(),
        )
    }

    /// Returns the predefined null data type.
    #[must_use]
    pub fn null() -> Self {
        Self::new_unchecked(
            Uri::new_unchecked("https://blockprotocol.org/types/@blockprotocol/data-type/null"),
            "Null",
            "A placeholder value representing 'nothing'".to_owned(),
            "null",
            HashMap::default(),
        )
    }

    /// Returns the predefined object data type.
    #[must_use]
    pub fn object() -> Self {
        Self::new_unchecked(
            Uri::new_unchecked("https://blockprotocol.org/types/@blockprotocol/data-type/object"),
            "Object",
            "A plain JSON object with no pre-defined structure".to_owned(),
            "object",
            HashMap::default(),
        )
    }

    /// Returns the predefined empty-list data type.
    #[must_use]
    pub fn empty_list() -> Self {
        Self::new_unchecked(
            Uri::new_unchecked(
                "https://blockprotocol.org/types/@blockprotocol/data-type/empty-list",
            ),
            "Empty List",
            "An Empty List".to_owned(),
            "array",
            [("const".to_owned(), json!([]))].into_iter().collect(),
        )
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum DataTypeTag {
    DataType,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTypeRepr {
    #[serde(rename = "kind")]
    _kind: DataTypeTag,
    #[serde(rename = "$id")]
    id: Uri,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(rename = "type")]
    ty: String,
    #[serde(flatten)]
    additional_properties: HashMap<String, serde_json::Value>,
}

impl TryFrom<DataTypeRepr> for DataType {
    type Error = ValidationError;

    fn try_from(data_type: DataTypeRepr) -> Result<Self, ValidationError> {
        Self::new(
            data_type.id,
            data_type.title,
            data_type.description,
            data_type.ty,
            data_type.additional_properties,
        )
    }
}

impl Validate for DataType {
    fn validate(&self) -> Result<(), ValidationError> {
        Ok(())
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
