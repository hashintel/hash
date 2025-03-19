use serde::Deserialize;
use thiserror::Error;

use crate::knowledge::property::{PropertyPath, PropertyWithMetadata};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
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
