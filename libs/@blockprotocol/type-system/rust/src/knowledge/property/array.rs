use super::{PropertyWithMetadata, metadata::ArrayMetadata};

#[derive(Debug, Default, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyWithMetadataArray {
    #[serde(default)]
    #[cfg_attr(feature = "utoipa", schema(required))]
    pub value: Vec<PropertyWithMetadata>,
    #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
    pub metadata: ArrayMetadata,
}

impl PropertyWithMetadataArray {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.value.is_empty() && self.metadata.is_empty()
    }
}
