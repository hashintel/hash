use core::mem;

use error_stack::Report;
use serde::{Deserialize, Serialize};

use crate::knowledge::{
    property::metadata::PropertyPathError, Confidence, PropertyMetadataElement, PropertyProvenance,
};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct PropertyMetadataArray {
    pub elements: Vec<PropertyMetadataElement>,
    #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
    pub metadata: ArrayMetadata,
}

impl PropertyMetadataArray {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.elements.is_empty() && self.metadata.is_empty()
    }

    pub fn add(
        &mut self,
        index: usize,
        metadata: PropertyMetadataElement,
    ) -> Result<(), Report<PropertyPathError>> {
        self.elements.insert(index, metadata);
        Ok(())
    }

    pub fn remove(
        &mut self,
        index: usize,
    ) -> Result<PropertyMetadataElement, Report<PropertyPathError>> {
        if index >= self.elements.len() {
            Err(PropertyPathError::ArrayIndexNotFound { index }.into())
        } else {
            Ok(self.elements.remove(index))
        }
    }

    pub fn replace(
        &mut self,
        index: usize,
        metadata: PropertyMetadataElement,
    ) -> Result<PropertyMetadataElement, Report<PropertyPathError>> {
        Ok(mem::replace(
            self.elements
                .get_mut(index)
                .ok_or(PropertyPathError::ArrayIndexNotFound { index })?,
            metadata,
        ))
    }
}
