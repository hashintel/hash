//! # Principal Module
//!
//! The Principal module defines a comprehensive identity and access management system for the Block
//! Protocol type system. It establishes a hierarchical structure for representing various actors
//! and their roles within a system.
//!
//! ## Core Components
//!
//! The principal system consists of three main categories:
//!
//! 1. **Actors** - Individual entities that can perform actions:
//!    - `User` - Human users with accounts in the system
//!    - `Machine` - Server or programmatic agents
//!    - `Ai` - Artificial intelligence actors
//!
//! 2. **Actor Groups** - Collections of actors:
//!    - `Web` - Web-based identity groupings
//!    - `Team` - Organizational team structures
//!
//! 3. **Roles** - Access control designations:
//!    - `WebRole` - Roles within web contexts
//!    - `TeamRole` - Roles within team contexts
//!
//! Each component has a corresponding ID type that encapsulates its identity in a type-safe manner.
//!
//! ## Usage
//!
//! The principal system is used for:
//!
//! - Tracking the origin of changes in the type system
//! - Implementing access control and permissions
//! - Providing identity context for entities and operations
//! - Supporting audit trails and provenance tracking
//!
//! ### Key Types
//!
//! - [`Actor`] - Represents individual agents that can perform actions in the system
//! - [`ActorId`] - Type-safe identifier for actors
//! - [`PrincipalId`] - Union type for all principal identifiers
//! - [`PrincipalType`] - Enumeration of all principal categories
//! - [`Principal`] - Union type for concrete principal implementations

use uuid::Uuid;

pub use self::{actor::Actor, actor_group::ActorGroup, role::Role};
use self::{
    actor::{ActorId, ActorType, AiId, MachineId, UserId},
    actor_group::{ActorGroupId, ActorGroupType, TeamId, WebId},
    role::{RoleId, RoleType, TeamRoleId, WebRoleId},
};

pub mod actor;
pub mod actor_group;
pub mod role;

/// Available principal types in the system.
///
/// Categorizes principals as individual actors, actor groups, or roles.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::FromSql, postgres_types::ToSql),
    postgres(name = "principal_type", rename_all = "snake_case")
)]
pub enum PrincipalType {
    User,
    Machine,
    Ai,
    Web,
    Team,
    WebRole,
    TeamRole,
}

impl From<ActorType> for PrincipalType {
    fn from(actor_type: ActorType) -> Self {
        match actor_type {
            ActorType::User => Self::User,
            ActorType::Machine => Self::Machine,
            ActorType::Ai => Self::Ai,
        }
    }
}

impl From<ActorGroupType> for PrincipalType {
    fn from(actor_group_type: ActorGroupType) -> Self {
        match actor_group_type {
            ActorGroupType::Web => Self::Web,
            ActorGroupType::Team => Self::Team,
        }
    }
}

impl From<RoleType> for PrincipalType {
    fn from(role_type: RoleType) -> Self {
        match role_type {
            RoleType::Web => Self::WebRole,
            RoleType::Team => Self::TeamRole,
        }
    }
}

/// Unified identifier for any principal in the system.
///
/// Wraps specific identifier types for actors, actor groups, and roles into a single
/// enumeration, allowing them to be used interchangeably in authorization contexts.
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
#[serde(tag = "principalType", rename_all = "camelCase")]
pub enum PrincipalId {
    Actor(ActorId),
    ActorGroup(ActorGroupId),
    Role(RoleId),
}

impl PrincipalId {
    /// Creates a new principal ID from a UUID and principal type.
    ///
    /// Constructs the appropriate typed ID based on the specified principal type,
    /// wrapping the provided UUID in the correct identifier structure.
    #[must_use]
    pub fn new(uuid: Uuid, principal_type: PrincipalType) -> Self {
        match principal_type {
            PrincipalType::User => Self::Actor(ActorId::User(UserId::new(uuid))),
            PrincipalType::Machine => Self::Actor(ActorId::Machine(MachineId::new(uuid))),
            PrincipalType::Ai => Self::Actor(ActorId::Ai(AiId::new(uuid))),
            PrincipalType::Web => Self::ActorGroup(ActorGroupId::Web(WebId::new(uuid))),
            PrincipalType::Team => Self::ActorGroup(ActorGroupId::Team(TeamId::new(uuid))),
            PrincipalType::WebRole => Self::Role(RoleId::Web(WebRoleId::new(uuid))),
            PrincipalType::TeamRole => Self::Role(RoleId::Team(TeamRoleId::new(uuid))),
        }
    }

    /// Returns the principal type of this ID.
    ///
    /// Inspects the variant and inner type to determine the specific principal type.
    #[must_use]
    pub const fn principal_type(self) -> PrincipalType {
        match self {
            Self::Actor(ActorId::User(_)) => PrincipalType::User,
            Self::Actor(ActorId::Machine(_)) => PrincipalType::Machine,
            Self::Actor(ActorId::Ai(_)) => PrincipalType::Ai,
            Self::ActorGroup(ActorGroupId::Web(_)) => PrincipalType::Web,
            Self::ActorGroup(ActorGroupId::Team(_)) => PrincipalType::Team,
            Self::Role(RoleId::Web(_)) => PrincipalType::WebRole,
            Self::Role(RoleId::Team(_)) => PrincipalType::TeamRole,
        }
    }
}

impl From<PrincipalId> for Uuid {
    fn from(principal_id: PrincipalId) -> Self {
        match principal_id {
            PrincipalId::Actor(actor_id) => actor_id.into(),
            PrincipalId::ActorGroup(actor_group_id) => actor_group_id.into(),
            PrincipalId::Role(role_id) => role_id.into(),
        }
    }
}

#[cfg(feature = "postgres")]
impl postgres_types::ToSql for PrincipalId {
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
            Self::Actor(actor_id) => actor_id.to_sql(ty, out),
            Self::ActorGroup(actor_group_id) => actor_group_id.to_sql(ty, out),
            Self::Role(role_id) => role_id.to_sql(ty, out),
        }
    }
}

/// A concrete principal entity within the system.
///
/// Represents an actor, team, or role that can be referenced for authorization
/// and provenance tracking purposes.
#[derive(Debug, serde::Serialize, serde::Deserialize, derive_more::From)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "principalType", rename_all = "camelCase")]
pub enum Principal {
    Actor(Actor),
    ActorGroup(ActorGroup),
    Role(Role),
}

impl Principal {
    /// Returns the unique identifier for this principal.
    ///
    /// Extracts the appropriate ID from the inner actor, team, or role.
    #[must_use]
    pub const fn id(&self) -> PrincipalId {
        match self {
            Self::Actor(actor) => PrincipalId::Actor(actor.id()),
            Self::ActorGroup(actor_group) => PrincipalId::ActorGroup(actor_group.id()),
            Self::Role(role) => PrincipalId::Role(role.id()),
        }
    }
}
