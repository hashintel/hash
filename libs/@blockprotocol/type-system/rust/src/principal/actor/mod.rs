//! Individual actors that can perform actions in the system.
//!
//! Defines the actor types and their associated identifiers:
//! - Users: Human users with accounts
//! - Machines: Server or programmatic agents
//! - AI: Artificial intelligence agents
//!
//! Each actor type has a corresponding ID type for type-safe identification.

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

/// A branded [`EntityUuid`] specifically for actor entities.
///
/// Provides type safety by distinguishing actor entity UUIDs from other entity UUIDs,
/// preventing accidental misuse across different entity domains.
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
    /// Creates a new `ActorEntityUuid` from any value that can be converted to a `Uuid`.
    ///
    /// Wraps the provided UUID in the appropriate branded type structure.
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

/// Types of individual actors in the system.
///
/// Represents the different categories of entities that can perform actions.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub enum ActorType {
    User,
    Machine,
    Ai,
}

/// Type-safe identifier for an actor in the system.
///
/// Wraps specific actor ID types ([`UserId`], [`MachineId`], [`AiId`]) in a tagged enumeration,
/// allowing different actor types to be handled uniformly while preserving type information.
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
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "actorType", content = "id", rename_all = "camelCase")]
pub enum ActorId {
    User(UserId),
    Machine(MachineId),
    Ai(AiId),
}

impl ActorId {
    /// Creates a new [`ActorId`] from a UUID and actor type.
    ///
    /// Constructs the appropriate typed ID based on the specified [`ActorType`],
    /// wrapping the provided UUID in the correct identifier structure.
    #[must_use]
    pub fn new(actor_entity_uuid: impl Into<Uuid>, actor_type: ActorType) -> Self {
        match actor_type {
            ActorType::User => Self::User(UserId::new(actor_entity_uuid)),
            ActorType::Ai => Self::Ai(AiId::new(actor_entity_uuid)),
            ActorType::Machine => Self::Machine(MachineId::new(actor_entity_uuid)),
        }
    }

    /// Returns the [`ActorType`] of this ID.
    ///
    /// Determines the specific actor type based on the variant.
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

/// An individual actor that can perform actions in the system.
///
/// Represents the concrete implementation of an actor with its attributes and capabilities.
/// Each variant corresponds to a specific [`ActorType`].
#[derive(Debug, serde::Serialize, serde::Deserialize, derive_more::From)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "actorType", rename_all = "camelCase")]
pub enum Actor {
    User(User),
    Machine(Machine),
    Ai(Ai),
}

impl Actor {
    /// Returns the [`ActorType`] of this actor.
    ///
    /// Determines the specific type based on the variant.
    #[must_use]
    pub const fn actor_type(&self) -> ActorType {
        match self {
            Self::User(_) => ActorType::User,
            Self::Machine(_) => ActorType::Machine,
            Self::Ai(_) => ActorType::Ai,
        }
    }

    /// Returns the unique [`ActorId`] for this actor.
    ///
    /// Extracts the ID from the inner actor implementation.
    #[must_use]
    pub const fn id(&self) -> ActorId {
        match self {
            Self::User(user) => ActorId::User(user.id),
            Self::Machine(machine) => ActorId::Machine(machine.id),
            Self::Ai(ai) => ActorId::Ai(ai.id),
        }
    }

    /// Returns an iterator over all [`RoleId`]s assigned to this actor.
    ///
    /// Provides access to the roles this actor has been granted in the system.
    pub fn roles(&self) -> impl Iterator<Item = RoleId> {
        match self {
            Self::User(user) => user.roles.iter().copied(),
            Self::Machine(machine) => machine.roles.iter().copied(),
            Self::Ai(ai) => ai.roles.iter().copied(),
        }
    }
}
