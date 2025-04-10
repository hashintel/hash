mod team;
mod web;

use uuid::Uuid;

pub use self::{
    team::{Team, TeamId},
    web::{Web, WebId},
};
use crate::knowledge::entity::id::EntityUuid;

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
pub struct ActorGroupEntityUuid(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<EntityUuid, \"ActorGroupEntityUuid\">")
    )]
    EntityUuid,
);

impl ActorGroupEntityUuid {
    #[must_use]
    pub fn new(entity_uuid: impl Into<Uuid>) -> Self {
        Self(EntityUuid::new(entity_uuid))
    }
}

impl From<ActorGroupEntityUuid> for EntityUuid {
    fn from(actor_group_entity_uuid: ActorGroupEntityUuid) -> Self {
        actor_group_entity_uuid.0
    }
}

impl From<ActorGroupEntityUuid> for Uuid {
    fn from(actor_group_entity_uuid: ActorGroupEntityUuid) -> Self {
        actor_group_entity_uuid.0.into()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub enum ActorGroupType {
    Team,
    Web,
}

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
    derive_more::From,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "actorGroupType", rename_all = "camelCase")]
pub enum ActorGroupId {
    Team(TeamId),
    Web(WebId),
}
impl ActorGroupId {
    #[must_use]
    pub fn new(actor_group_entity_uuid: impl Into<Uuid>, actor_type: ActorGroupType) -> Self {
        match actor_type {
            ActorGroupType::Team => Self::Team(TeamId::new(actor_group_entity_uuid)),
            ActorGroupType::Web => Self::Web(WebId::new(actor_group_entity_uuid)),
        }
    }

    #[must_use]
    pub const fn actor_type(&self) -> ActorGroupType {
        match self {
            Self::Team(_) => ActorGroupType::Team,
            Self::Web(_) => ActorGroupType::Web,
        }
    }
}

impl From<ActorGroupId> for ActorGroupEntityUuid {
    fn from(actor_group: ActorGroupId) -> Self {
        match actor_group {
            ActorGroupId::Team(id) => id.into(),
            ActorGroupId::Web(id) => id.into(),
        }
    }
}

impl From<ActorGroupId> for EntityUuid {
    fn from(actor_group: ActorGroupId) -> Self {
        match actor_group {
            ActorGroupId::Team(id) => id.into(),
            ActorGroupId::Web(id) => id.into(),
        }
    }
}

impl From<ActorGroupId> for Uuid {
    fn from(actor_group: ActorGroupId) -> Self {
        match actor_group {
            ActorGroupId::Team(id) => id.into(),
            ActorGroupId::Web(id) => id.into(),
        }
    }
}

#[cfg(feature = "postgres")]
impl postgres_types::ToSql for ActorGroupId {
    postgres_types::accepts!(UUID);

    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut bytes::BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn core::error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        match self {
            Self::Team(team_id) => team_id.to_sql(ty, out),
            Self::Web(web_id) => web_id.to_sql(ty, out),
        }
    }
}

#[derive(Debug, derive_more::From)]
pub enum ActorGroup {
    Team(Team),
    Web(Web),
}

impl ActorGroup {
    #[must_use]
    pub const fn id(&self) -> ActorGroupId {
        match self {
            Self::Web(web) => ActorGroupId::Web(web.id),
            Self::Team(team) => ActorGroupId::Team(team.id),
        }
    }
}
