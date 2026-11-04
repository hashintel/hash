use serde::{Deserialize, Serialize};

use super::EntityId;
use crate::knowledge::{Confidence, property::metadata::PropertyProvenance};

/// The entities a link entity connects.
///
/// Serializes as `LinkData`, with the source as the left entity and the target as the right
/// entity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(from = "LinkData", into = "LinkData")]
pub enum Link {
    /// A link from the `source` entity to the `target` entity.
    Directed {
        source: LinkEndpoint,
        target: LinkEndpoint,
    },
}

/// An entity a link connects, with the confidence and provenance of that connection.
#[derive(Debug, Clone, PartialEq)]
pub struct LinkEndpoint {
    pub entity_id: EntityId,
    pub confidence: Option<Confidence>,
    pub provenance: PropertyProvenance,
}

/// The associated information for 'Link' entities.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LinkData {
    left_entity_id: EntityId,
    right_entity_id: EntityId,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    left_entity_confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    left_entity_provenance: PropertyProvenance,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    right_entity_confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyProvenance::is_empty")]
    right_entity_provenance: PropertyProvenance,
}

#[cfg(feature = "utoipa")]
impl<'s> utoipa::ToSchema<'s> for Link {
    fn schema() -> (&'s str, utoipa::openapi::RefOr<utoipa::openapi::Schema>) {
        <LinkData as utoipa::ToSchema<'s>>::schema()
    }
}

impl From<LinkData> for Link {
    fn from(link_data: LinkData) -> Self {
        Self::Directed {
            source: LinkEndpoint {
                entity_id: link_data.left_entity_id,
                confidence: link_data.left_entity_confidence,
                provenance: link_data.left_entity_provenance,
            },
            target: LinkEndpoint {
                entity_id: link_data.right_entity_id,
                confidence: link_data.right_entity_confidence,
                provenance: link_data.right_entity_provenance,
            },
        }
    }
}

impl From<Link> for LinkData {
    fn from(link: Link) -> Self {
        let Link::Directed { source, target } = link;
        Self {
            left_entity_id: source.entity_id,
            right_entity_id: target.entity_id,
            left_entity_confidence: source.confidence,
            left_entity_provenance: source.provenance,
            right_entity_confidence: target.confidence,
            right_entity_provenance: target.provenance,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::Link;
    use crate::knowledge::Confidence;

    const LEFT_ENTITY_ID: &str =
        "1a0a5d16-6c1b-4a8e-8f0e-6a4d3c2b1a00~2b1b6e27-7d2c-4b9f-9a1f-7b5e4d3c2b11";
    const RIGHT_ENTITY_ID: &str =
        "1a0a5d16-6c1b-4a8e-8f0e-6a4d3c2b1a00~3c2c7f38-8e3d-4ca0-ab20-8c6f5e4d3c22";

    #[test]
    fn link_data_round_trip() {
        let link_data = json!({
            "leftEntityId": LEFT_ENTITY_ID,
            "rightEntityId": RIGHT_ENTITY_ID,
            "leftEntityConfidence": 0.9,
            "rightEntityProvenance": { "sources": [{ "type": "webpage" }] },
        });

        let link: Link =
            serde_json::from_value(link_data.clone()).expect("should read the link data");
        let Link::Directed { source, target } = &link;
        assert_eq!(
            source.entity_id.to_string(),
            LEFT_ENTITY_ID,
            "the left entity should be the source"
        );
        assert_eq!(source.confidence, Confidence::new(0.9));
        assert!(source.provenance.is_empty());
        assert_eq!(
            target.entity_id.to_string(),
            RIGHT_ENTITY_ID,
            "the right entity should be the target"
        );
        assert_eq!(target.confidence, None);
        assert_eq!(target.provenance.sources.len(), 1);

        assert_eq!(
            serde_json::to_value(&link).expect("should write the link"),
            link_data,
            "the link should be written as the link data it was read from"
        );
    }
}
