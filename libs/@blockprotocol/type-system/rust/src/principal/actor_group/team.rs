use std::collections::HashSet;

use uuid::Uuid;

use super::{ActorGroupEntityUuid, ActorGroupId};
use crate::{knowledge::entity::id::EntityUuid, principal::role::TeamRoleId};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct TeamId(ActorGroupEntityUuid);

impl TeamId {
    #[must_use]
    pub fn new(actor_group_entity_uuid: impl Into<Uuid>) -> Self {
        Self(ActorGroupEntityUuid::new(actor_group_entity_uuid))
    }
}

impl From<TeamId> for ActorGroupEntityUuid {
    fn from(team_id: TeamId) -> Self {
        team_id.0
    }
}

impl From<TeamId> for EntityUuid {
    fn from(team_id: TeamId) -> Self {
        team_id.0.into()
    }
}

impl From<TeamId> for Uuid {
    fn from(team_id: TeamId) -> Self {
        team_id.0.into()
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Team {
    pub id: TeamId,
    pub parent_id: ActorGroupId,
    pub name: String,
    #[cfg_attr(feature = "codegen", specta(skip))]
    pub roles: HashSet<TeamRoleId>,
}
