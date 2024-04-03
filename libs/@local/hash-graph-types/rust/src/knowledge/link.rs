use serde::{Deserialize, Serialize};

use crate::knowledge::{entity::EntityId, Confidence};

/// The associated information for 'Link' entities
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LinkData {
    pub left_entity_id: EntityId,
    pub right_entity_id: EntityId,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left_entity_confidence: Option<Confidence>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right_entity_confidence: Option<Confidence>,
}
