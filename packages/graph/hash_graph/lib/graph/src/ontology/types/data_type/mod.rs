use std::collections::HashMap;

use error_stack::{ensure, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::ontology::types::{
    error::ValidationError,
    serde_shared::object::ValidateUri,
    uri::{BaseUri, VersionedUri},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DataTypeReference {
    // TODO: Test if the URI is an actual data type
    #[serde(rename = "$ref")]
    uri: VersionedUri,
}

impl DataTypeReference {
    /// Creates a new `DataTypeReference` from the given [`VersionedUri`].
    #[must_use]
    pub const fn new(uri: VersionedUri) -> Self {
        Self { uri }
    }

    #[must_use]
    pub const fn uri(&self) -> &VersionedUri {
        &self.uri
    }
}

impl ValidateUri for DataTypeReference {
    fn validate_uri(&self, base_uri: &BaseUri) -> Result<(), ValidationError> {
        ensure!(
            base_uri == self.uri().base_uri(),
            ValidationError::BaseUriMismatch {
                base_uri: base_uri.clone(),
                versioned_uri: self.uri().clone()
            }
        );
        Ok(())
    }
}

/// Will serialize as a constant value `"dataType"`
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
    id: VersionedUri,
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
    #[must_use]
    pub const fn new(
        id: VersionedUri,
        title: String,
        description: Option<String>,
        json_type: String,
        additional_properties: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            kind: DataTypeTag::DataType,
            id,
            title,
            description,
            json_type,
            additional_properties,
        }
    }

    #[must_use]
    pub const fn id(&self) -> &VersionedUri {
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
            VersionedUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text".to_owned(),
                1,
            ),
            "Text".to_owned(),
            Some("An ordered sequence of characters".to_owned()),
            "string".to_owned(),
            HashMap::default(),
        )
    }

    /// Returns the primitive `Number` data type.
    #[must_use]
    pub fn number() -> Self {
        Self::new(
            VersionedUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/number".to_owned(),
                1,
            ),
            "Number".to_owned(),
            Some("An arithmetical value (in the Real number system)".to_owned()),
            "number".to_owned(),
            HashMap::default(),
        )
    }

    /// Returns the primitive `Boolean` data type.
    #[must_use]
    pub fn boolean() -> Self {
        Self::new(
            VersionedUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/boolean".to_owned(),
                1,
            ),
            "Boolean".to_owned(),
            Some("A True or False value".to_owned()),
            "boolean".to_owned(),
            HashMap::default(),
        )
    }

    /// Returns the primitive `Null` data type.
    #[must_use]
    pub fn null() -> Self {
        Self::new(
            VersionedUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/null".to_owned(),
                1,
            ),
            "Null".to_owned(),
            Some("A placeholder value representing 'nothing'".to_owned()),
            "null".to_owned(),
            HashMap::default(),
        )
    }

    /// Returns the primitive `Object` data type.
    #[must_use]
    pub fn object() -> Self {
        Self::new(
            VersionedUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/object".to_owned(),
                1,
            ),
            "Object".to_owned(),
            Some("A plain JSON object with no pre-defined structure".to_owned()),
            "object".to_owned(),
            HashMap::default(),
        )
    }

    /// Returns the primitive `Empty List` data type.
    #[must_use]
    pub fn empty_list() -> Self {
        Self::new(
            VersionedUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list".to_owned(),
                1,
            ),
            "Empty List".to_owned(),
            Some("An Empty List".to_owned()),
            "array".to_owned(),
            [("const".to_owned(), json!([]))].into_iter().collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, result::Result};

    use super::*;

    #[test]
    fn data_type_reference() -> Result<(), Box<dyn Error>> {
        let reference = DataTypeReference::new(VersionedUri::new(
            "https://example.com/data_type".to_owned(),
            1,
        ));
        let json = serde_json::to_value(&reference)?;

        assert_eq!(
            json,
            json!({
                "$ref": "https://example.com/data_type/v/1"
            })
        );

        let reference2: DataTypeReference = serde_json::from_value(json)?;
        assert_eq!(reference, reference2);
        Ok(())
    }

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
            serde_json::from_str(crate::test_data::data_type::TEXT_V1).expect("invalid JSON"),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn number() {
        validate(
            &DataType::number(),
            serde_json::from_str(crate::test_data::data_type::NUMBER_V1).expect("invalid JSON"),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn boolean() {
        validate(
            &DataType::boolean(),
            serde_json::from_str(crate::test_data::data_type::BOOLEAN_V1).expect("invalid JSON"),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn null() {
        validate(
            &DataType::null(),
            serde_json::from_str(crate::test_data::data_type::NULL_V1).expect("invalid JSON"),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn object() {
        validate(
            &DataType::object(),
            serde_json::from_str(crate::test_data::data_type::OBJECT_V1).expect("invalid JSON"),
        )
        .expect("Invalid data type");
    }

    #[test]
    fn empty_list() {
        validate(
            &DataType::empty_list(),
            serde_json::from_str(crate::test_data::data_type::EMPTY_LIST_V1).expect("invalid JSON"),
        )
        .expect("Invalid data type");
    }
}
