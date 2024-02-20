use std::{collections::HashMap, ptr};

pub use error::ParseDataTypeError;
use serde::{Deserialize, Serialize};

use crate::{
    url::{BaseUrl, VersionedUrl},
    ValidateUrl, ValidationError,
};

mod error;
pub(in crate::ontology) mod raw;
#[cfg(target_arch = "wasm32")]
mod wasm;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "raw::DataType", into = "raw::DataType")]
pub struct DataType {
    id: VersionedUrl,
    title: String,
    description: Option<String>,
    json_type: String,
    /// Properties which are not currently strongly typed.
    ///
    /// The data type meta-schema currently allows arbitrary, untyped properties. This is a
    /// catch-all field to store all non-typed data.
    additional_properties: HashMap<String, serde_json::Value>,
}

impl DataType {
    #[must_use]
    pub const fn new(
        id: VersionedUrl,
        title: String,
        description: Option<String>,
        json_type: String,
        additional_properties: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            id,
            title,
            description,
            json_type,
            additional_properties,
        }
    }

    #[must_use]
    pub const fn id(&self) -> &VersionedUrl {
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
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct DataTypeReference {
    url: VersionedUrl,
}

impl DataTypeReference {
    /// Creates a new `DataTypeReference` from the given [`VersionedUrl`].
    #[must_use]
    pub const fn new(url: VersionedUrl) -> Self {
        Self { url }
    }

    #[must_use]
    pub const fn url(&self) -> &VersionedUrl {
        &self.url
    }
}

impl From<&VersionedUrl> for &DataTypeReference {
    fn from(url: &VersionedUrl) -> Self {
        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref::<VersionedUrl>(url).cast::<DataTypeReference>() }
    }
}

impl ValidateUrl for DataTypeReference {
    fn validate_url(&self, base_url: &BaseUrl) -> Result<(), ValidationError> {
        if base_url == &self.url().base_url {
            Ok(())
        } else {
            Err(ValidationError::BaseUrlMismatch {
                base_url: base_url.clone(),
                versioned_url: self.url().clone(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use serde_json::json;

    use super::*;
    use crate::{
        url::ParseVersionedUrlError,
        utils::tests::{check_serialization_from_str, ensure_failed_validation},
    };

    #[test]
    fn text() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::TEXT_V1,
            None,
        );
    }

    #[test]
    fn number() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::NUMBER_V1,
            None,
        );
    }

    #[test]
    fn boolean() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::BOOLEAN_V1,
            None,
        );
    }

    #[test]
    fn null() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::NULL_V1,
            None,
        );
    }

    #[test]
    fn object() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::OBJECT_V1,
            None,
        );
    }

    #[test]
    fn empty_list() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::EMPTY_LIST_V1,
            None,
        );
    }

    #[test]
    fn invalid_schema() {
        let invalid_schema_url = "https://blockprotocol.org/types/modules/graph/0.3/schema/foo";

        ensure_failed_validation::<raw::DataType, DataType>(
            &json!(
                {
                  "$schema": invalid_schema_url,
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  "title": "Text",
                  "description": "An ordered sequence of characters",
                  "type": "string"
                }
            ),
            ParseDataTypeError::InvalidMetaSchema(invalid_schema_url.to_owned()),
        );
    }

    #[test]
    fn invalid_id() {
        ensure_failed_validation::<raw::DataType, DataType>(
            &json!(
                {
                  "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
                  "kind": "dataType",
                  "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1.5",
                  "title": "Text",
                  "description": "An ordered sequence of characters",
                  "type": "string"
                }
            ),
            ParseDataTypeError::InvalidVersionedUrl(ParseVersionedUrlError::AdditionalEndContent(
                ".5".to_owned(),
            )),
        );
    }

    #[test]
    fn validate_data_type_ref_valid() {
        let url = VersionedUrl::from_str(
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        )
        .expect("failed to create VersionedUrl");

        let data_type_ref = DataTypeReference::new(url.clone());

        data_type_ref
            .validate_url(&url.base_url)
            .expect("failed to validate against base URL");
    }

    #[test]
    fn validate_data_type_ref_invalid() {
        let url_a =
            VersionedUrl::from_str("https://blockprotocol.org/@alice/types/property-type/age/v/2")
                .expect("failed to parse VersionedUrl");
        let url_b =
            VersionedUrl::from_str("https://blockprotocol.org/@alice/types/property-type/name/v/1")
                .expect("failed to parse VersionedUrl");

        let data_type_ref = DataTypeReference::new(url_a);

        data_type_ref
            .validate_url(&url_b.base_url)
            .expect_err("expected validation against base URL to fail but it didn't");
    }
}
