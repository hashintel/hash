use serde::{Deserialize, Serialize};

use crate::knowledge::entity::EntityId;

/// The associated information for 'Link' entities
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LinkData {
    pub left_entity_id: EntityId,
    pub right_entity_id: EntityId,
}
