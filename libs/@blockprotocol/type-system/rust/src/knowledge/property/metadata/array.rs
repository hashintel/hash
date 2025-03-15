use super::{PropertyMetadata, PropertyProvenance};
use crate::knowledge::Confidence;

#[derive(Debug, Default, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
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
    pub const fn is_empty(&self) -> bool {
        self.confidence.is_none() && self.provenance.is_empty()
    }
}

#[derive(Debug, Default, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyArrayMetadata {
    /// Metadata for each item in the array.
    pub value: Vec<PropertyMetadata>,

    /// Metadata that applies to the array as a whole.
    #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
    pub metadata: ArrayMetadata,
}

impl PropertyArrayMetadata {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.value.is_empty() && self.metadata.is_empty()
    }
}
