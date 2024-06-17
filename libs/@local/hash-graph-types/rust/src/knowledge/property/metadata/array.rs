use serde::{Deserialize, Serialize};

use crate::knowledge::{Confidence, PropertyMetadataElement, PropertyProvenance};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArrayMetadata {
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    pub provenance: PropertyProvenance,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
}

impl ArrayMetadata {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.confidence.is_none() && self.provenance.is_empty()
    }
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyMetadataArray {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub value: Vec<PropertyMetadataElement>,
    #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
    pub metadata: ArrayMetadata,
}

impl PropertyMetadataArray {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.value.is_empty() && self.metadata.is_empty()
    }
}
