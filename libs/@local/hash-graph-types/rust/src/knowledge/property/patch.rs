use serde::Deserialize;

use crate::knowledge::{
    property::provenance::PropertyProvenance, Confidence, Property, PropertyMetadataElement,
    PropertyPath,
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn test_deserialize_property_patch_operation() {
        let json = json!({
            "op": "add",
            "path": ["a", "b"],
            "value": {
                "object": {
                    "c": 1
                }
            },
            "metadata": {
                "provenance": {
                    "confidence": 0.5
                }
            }
        });
    }
}
