use serde::Deserialize;
use thiserror::Error;

use crate::knowledge::{Property, PropertyMetadata, PropertyPath};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "op")]
pub enum PropertyPatchOperation {
    Add {
        path: PropertyPath<'static>,
        value: Property,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        metadata: Option<PropertyMetadata>,
    },
    Remove {
        path: PropertyPath<'static>,
    },
    Replace {
        path: PropertyPath<'static>,
        value: Property,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        metadata: Option<PropertyMetadata>,
    },
}
#[derive(Debug, Copy, Clone, PartialEq, Eq, Error)]
#[error("Failed to apply patch")]
pub struct PatchError;
