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
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct TeamId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorGroupEntityUuid, \"TeamId\">")
    )]
    ActorGroupEntityUuid,
);

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

#[derive(Debug)]
pub struct Team {
    pub id: TeamId,
    pub parents: Vec<ActorGroupId>,
    pub roles: HashSet<TeamRoleId>,
}
