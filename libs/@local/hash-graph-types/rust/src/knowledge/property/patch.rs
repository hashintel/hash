use serde::Deserialize;

use crate::knowledge::{
    property::provenance::PropertyProvenance, Confidence, Property, PropertyPath,
};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", tag = "op")]
pub enum PropertyPatchOperation {
    Add {
        path: PropertyPath<'static>,
        value: Property,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        confidence: Option<Confidence>,
        #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        provenance: PropertyProvenance,
    },
    Remove {
        path: PropertyPath<'static>,
    },
    Replace {
        path: PropertyPath<'static>,
        value: Property,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        confidence: Option<Confidence>,
        #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        provenance: PropertyProvenance,
    },
    Move {
        from: PropertyPath<'static>,
        path: PropertyPath<'static>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        confidence: Option<Confidence>,
        #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        provenance: PropertyProvenance,
    },
    Copy {
        from: PropertyPath<'static>,
        path: PropertyPath<'static>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        confidence: Option<Confidence>,
        #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
        #[cfg_attr(feature = "utoipa", schema(nullable = false))]
        provenance: PropertyProvenance,
    },
    Test {
        path: PropertyPath<'static>,
        value: Property,
    },
}
