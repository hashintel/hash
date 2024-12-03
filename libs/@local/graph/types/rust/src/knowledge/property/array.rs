use serde::{Deserialize, Serialize};

use crate::knowledge::property::{ArrayMetadata, PropertyWithMetadata};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyWithMetadataArray {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub value: Vec<PropertyWithMetadata>,
    #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
    pub metadata: ArrayMetadata,
}

impl PropertyWithMetadataArray {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.value.is_empty() && self.metadata.is_empty()
    }
}
