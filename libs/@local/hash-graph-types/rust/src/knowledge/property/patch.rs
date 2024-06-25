use serde::Deserialize;
use thiserror::Error;

use crate::knowledge::{PropertyPath, PropertyWithMetadata};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "op")]
pub enum PropertyPatchOperation {
    Add {
        path: PropertyPath<'static>,
        property: PropertyWithMetadata,
    },
    Remove {
        path: PropertyPath<'static>,
    },
    Replace {
        path: PropertyPath<'static>,
        property: PropertyWithMetadata,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Error)]
#[error("Failed to apply patch")]
pub struct PatchError;
