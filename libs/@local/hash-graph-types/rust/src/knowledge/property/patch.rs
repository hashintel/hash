use serde::Deserialize;

use crate::knowledge::{Property, PropertyMetadataElement, PropertyPath};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "op")]
pub enum PropertyPatchOperation {
    Add {
        path: PropertyPath<'static>,
        value: Property,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        metadata: Option<PropertyMetadataElement>,
    },
    Remove {
        path: PropertyPath<'static>,
    },
    Replace {
        path: PropertyPath<'static>,
        value: Property,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        metadata: Option<PropertyMetadataElement>,
    },
}
