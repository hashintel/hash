//! Groups of actors that share common characteristics or purposes.
//!
//! Defines actor group types and their associated identifiers:
//! - Web: Web-based groups representing domains or organizations
//! - Team: Organizational teams with members and shared access
//!
//! Each group type has a corresponding ID type for type-safe identification.

mod team;
mod web;

use uuid::Uuid;

pub use self::{
    team::{Team, TeamId},
    web::{Web, WebId},
};
use crate::knowledge::entity::id::EntityUuid;

/// A branded [`EntityUuid`] specifically for actor group entities.
///
/// Provides type safety by distinguishing actor group entity UUIDs from other entity UUIDs,
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
    specta::Type,
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
    /// Creates a new [`ActorGroupEntityUuid`] from any value that can be converted to a `Uuid`.
    ///
    /// Wraps the provided UUID in the appropriate branded type structure.
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

/// Types of actor groups in the system.
///
/// Represents the different categories of actor groupings.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub enum ActorGroupType {
    Web,
    Team,
}

/// Type-safe identifier for an actor group in the system.
///
/// Wraps specific actor group ID types ([`WebId`], [`TeamId`]) in a tagged enumeration,
/// allowing different actor group types to be handled uniformly while preserving type information.
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
    specta::Type,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "actorGroupType", content = "id", rename_all = "camelCase")]
pub enum ActorGroupId {
    Web(WebId),
    Team(TeamId),
}
impl ActorGroupId {
    /// Creates a new [`ActorGroupId`] from a UUID and actor group type.
    ///
    /// Constructs the appropriate typed ID based on the specified [`ActorGroupType`],
    /// wrapping the provided UUID in the correct identifier structure.
    #[must_use]
    pub fn new(actor_group_entity_uuid: impl Into<Uuid>, actor_type: ActorGroupType) -> Self {
        match actor_type {
            ActorGroupType::Team => Self::Team(TeamId::new(actor_group_entity_uuid)),
            ActorGroupType::Web => Self::Web(WebId::new(actor_group_entity_uuid)),
        }
    }

    /// Returns the [`ActorGroupType`] of this ID.
    ///
    /// Determines the specific actor group type based on the variant.
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

/// A group of actors that share common characteristics or purposes.
///
/// Represents the concrete implementation of an actor group with its attributes and capabilities.
/// Each variant corresponds to a specific [`ActorGroupType`].
#[derive(Debug, serde::Serialize, serde::Deserialize, derive_more::From, specta::Type)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "actorGroupType", rename_all = "camelCase")]
pub enum ActorGroup {
    Web(Web),
    Team(Team),
}

impl ActorGroup {
    /// Returns the unique [`ActorGroupId`] for this actor group.
    ///
    /// Extracts the ID from the inner actor group implementation.
    #[must_use]
    pub const fn id(&self) -> ActorGroupId {
        match self {
            Self::Web(web) => ActorGroupId::Web(web.id),
            Self::Team(team) => ActorGroupId::Team(team.id),
        }
    }
}
