use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use type_system::url::{BaseUrl, VersionedUrl};

use crate::knowledge::{property::PropertyProvenance, Confidence};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValueMetadata {
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    pub provenance: PropertyProvenance,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    pub confidence: Option<Confidence>,
    #[serde(with = "core::option::Option")]
    #[cfg_attr(feature = "utoipa", schema(required = true))]
    pub data_type_id: Option<VersionedUrl>,
    // Prevent `canonical` to be set from external application
    #[serde(skip)]
    pub canonical: HashMap<BaseUrl, f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyWithMetadataValue {
    pub value: serde_json::Value,
    pub metadata: ValueMetadata,
}
