use super::{PropertyWithMetadata, metadata::ArrayMetadata};

#[derive(Debug, Default, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyArrayWithMetadata {
    pub value: Vec<PropertyWithMetadata>,
    #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
    pub metadata: ArrayMetadata,
}

impl PropertyArrayWithMetadata {
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.value.is_empty() && self.metadata.is_empty()
    }
}
