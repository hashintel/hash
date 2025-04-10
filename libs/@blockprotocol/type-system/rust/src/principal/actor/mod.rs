mod ai;
mod machine;
mod user;

use uuid::Uuid;

pub use self::{
    ai::{Ai, AiId},
    machine::{Machine, MachineId},
    user::{User, UserId},
};
use super::role::RoleId;
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
pub struct ActorEntityUuid(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<EntityUuid, \"ActorEntityUuid\">")
    )]
    EntityUuid,
);

impl ActorEntityUuid {
    #[must_use]
    pub fn new(entity_uuid: impl Into<Uuid>) -> Self {
        Self(EntityUuid::new(entity_uuid))
    }
}

impl From<ActorEntityUuid> for EntityUuid {
    fn from(actor_entity_uuid: ActorEntityUuid) -> Self {
        actor_entity_uuid.0
    }
}

impl From<ActorEntityUuid> for Uuid {
    fn from(actor_entity_uuid: ActorEntityUuid) -> Self {
        actor_entity_uuid.0.into()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub enum ActorType {
    User,
    Machine,
    Ai,
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
#[serde(tag = "actorType", content = "id", rename_all = "camelCase")]
pub enum ActorId {
    User(UserId),
    Machine(MachineId),
    Ai(AiId),
}

impl ActorId {
    #[must_use]
    pub fn new(actor_entity_uuid: impl Into<Uuid>, actor_type: ActorType) -> Self {
        match actor_type {
            ActorType::User => Self::User(UserId::new(actor_entity_uuid)),
            ActorType::Ai => Self::Ai(AiId::new(actor_entity_uuid)),
            ActorType::Machine => Self::Machine(MachineId::new(actor_entity_uuid)),
        }
    }

    #[must_use]
    pub const fn actor_type(self) -> ActorType {
        match self {
            Self::User(_) => ActorType::User,
            Self::Machine(_) => ActorType::Machine,
            Self::Ai(_) => ActorType::Ai,
        }
    }
}

impl From<ActorId> for ActorEntityUuid {
    fn from(actor_id: ActorId) -> Self {
        match actor_id {
            ActorId::User(id) => id.into(),
            ActorId::Machine(id) => id.into(),
            ActorId::Ai(id) => id.into(),
        }
    }
}

impl From<ActorId> for EntityUuid {
    fn from(actor_id: ActorId) -> Self {
        match actor_id {
            ActorId::User(id) => id.into(),
            ActorId::Machine(id) => id.into(),
            ActorId::Ai(id) => id.into(),
        }
    }
}

impl From<ActorId> for Uuid {
    fn from(actor_id: ActorId) -> Self {
        match actor_id {
            ActorId::User(id) => id.into(),
            ActorId::Machine(id) => id.into(),
            ActorId::Ai(id) => id.into(),
        }
    }
}

#[cfg(feature = "postgres")]
impl postgres_types::ToSql for ActorId {
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
            Self::User(user_id) => user_id.to_sql(ty, out),
            Self::Machine(machine_id) => machine_id.to_sql(ty, out),
            Self::Ai(ai_id) => ai_id.to_sql(ty, out),
        }
    }
}

#[derive(Debug, derive_more::From)]
pub enum Actor {
    User(User),
    Machine(Machine),
    Ai(Ai),
}

impl Actor {
    #[must_use]
    pub const fn actor_type(&self) -> ActorType {
        match self {
            Self::User(_) => ActorType::User,
            Self::Machine(_) => ActorType::Machine,
            Self::Ai(_) => ActorType::Ai,
        }
    }

    #[must_use]
    pub const fn id(&self) -> ActorId {
        match self {
            Self::User(user) => ActorId::User(user.id),
            Self::Machine(machine) => ActorId::Machine(machine.id),
            Self::Ai(ai) => ActorId::Ai(ai.id),
        }
    }

    pub fn roles(&self) -> impl Iterator<Item = RoleId> {
        match self {
            Self::User(user) => user.roles.iter().copied(),
            Self::Machine(machine) => machine.roles.iter().copied(),
            Self::Ai(ai) => ai.roles.iter().copied(),
        }
    }
}
