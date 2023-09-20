use std::fmt;

use graph_types::knowledge::entity::{EntityId, EntityUuid};
use serde::{Deserialize, Serialize};

use crate::zanzibar::{Affiliation, Permission, Relation, Resource};

impl Resource for EntityId {
    type Id = EntityUuid;

    fn namespace() -> &'static str {
        "graph/entity"
    }

    fn id(&self) -> &Self::Id {
        &self.entity_uuid
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityRelation {
    DirectOwner,
    DirectViewer,
}

impl fmt::Display for EntityRelation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<EntityId> for EntityRelation {}
impl Relation<EntityId> for EntityRelation {}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityPermission {
    Update,
    View,
}

impl fmt::Display for EntityPermission {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<EntityId> for EntityPermission {}
impl Permission<EntityId> for EntityPermission {}
