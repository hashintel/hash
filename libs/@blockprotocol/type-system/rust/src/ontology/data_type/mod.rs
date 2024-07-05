#[cfg(feature = "postgres")]
use core::error::Error;
use core::{fmt, ptr};
use std::collections::HashMap;

pub use error::ParseDataTypeError;
#[cfg(feature = "postgres")]
use postgres_types::{private::BytesMut, FromSql, IsNull, Json, ToSql, Type};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{
    url::{BaseUrl, VersionedUrl},
    ValidateUrl, ValidationError,
};

mod error;
pub(in crate::ontology) mod raw;
#[cfg(target_arch = "wasm32")]
mod wasm;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(try_from = "raw::DataType", into = "raw::DataType")]
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

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for DataType {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Json::from_sql(ty, raw)?.0)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as FromSql>::accepts(ty)
    }
}

#[cfg(feature = "postgres")]
impl ToSql for DataType {
    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        Json(self).to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <Json<Self> as ToSql>::accepts(ty)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "raw::DataTypeReference", into = "raw::DataTypeReference")]
#[repr(transparent)]
pub struct DataTypeReference {
    pub url: VersionedUrl,
}

impl From<&VersionedUrl> for &DataTypeReference {
    fn from(url: &VersionedUrl) -> Self {
        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref::<VersionedUrl>(url).cast::<DataTypeReference>() }
    }
}

impl ValidateUrl for DataTypeReference {
    fn validate_url(&self, base_url: &BaseUrl) -> Result<(), ValidationError> {
        if base_url == &self.url.base_url {
            Ok(())
        } else {
            Err(ValidationError::BaseUrlMismatch {
                base_url: base_url.clone(),
                versioned_url: self.url.clone(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr;

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
        );
    }

    #[test]
    fn number() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::NUMBER_V1,
        );
    }

    #[test]
    fn boolean() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::BOOLEAN_V1,
        );
    }

    #[test]
    fn null() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::NULL_V1,
        );
    }

    #[test]
    fn object() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::OBJECT_V1,
        );
    }

    #[test]
    fn empty_list() {
        check_serialization_from_str::<DataType, raw::DataType>(
            graph_test_data::data_type::EMPTY_LIST_V1,
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
            &ParseDataTypeError::InvalidMetaSchema(invalid_schema_url.to_owned()),
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
            &ParseDataTypeError::InvalidVersionedUrl(ParseVersionedUrlError::AdditionalEndContent(
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

        let data_type_ref = DataTypeReference { url: url.clone() };

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

        let data_type_ref = DataTypeReference { url: url_a };

        data_type_ref
            .validate_url(&url_b.base_url)
            .expect_err("expected validation against base URL to fail but it didn't");
    }
}
