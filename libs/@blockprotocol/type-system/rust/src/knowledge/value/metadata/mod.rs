mod provenance;

use std::collections::HashMap;

pub use self::provenance::ValueProvenance;
use super::PropertyValue;
use crate::{
    knowledge::Confidence,
    ontology::{BaseUrl, VersionedUrl},
};

#[derive(Debug, Default, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValueMetadata {
    #[serde(default, skip_serializing_if = "ValueProvenance::is_empty")]
    pub provenance: ValueProvenance,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub confidence: Option<Confidence>,

    #[serde(with = "core::option::Option")]
    #[cfg_attr(feature = "utoipa", schema(required = true))]
    pub data_type_id: Option<VersionedUrl>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub original_data_type_id: Option<VersionedUrl>,

    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub canonical: HashMap<BaseUrl, PropertyValue>,
}
