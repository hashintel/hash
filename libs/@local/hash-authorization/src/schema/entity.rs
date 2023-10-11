use std::fmt;

use graph_types::knowledge::entity::EntityUuid;
use serde::{Deserialize, Serialize};

use crate::zanzibar::{Affiliation, Permission, Relation, Resource};

impl Resource for EntityUuid {
    type Id = Self;

    fn namespace() -> &'static str {
        "graph/entity"
    }

    fn id(&self) -> Self::Id {
        *self
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum EntityRelation {
    DirectOwner,
    DirectEditor,
    DirectViewer,
}

impl fmt::Display for EntityRelation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl Affiliation<EntityUuid> for EntityRelation {}
impl Relation<EntityUuid> for EntityRelation {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

impl Affiliation<EntityUuid> for EntityPermission {}
impl Permission<EntityUuid> for EntityPermission {}
