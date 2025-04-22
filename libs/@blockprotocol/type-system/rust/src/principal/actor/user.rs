//! Human user actor implementation.
//!
//! Defines the user-specific ID and structure, representing human accounts in the system.

use std::collections::HashSet;

use uuid::Uuid;

use super::ActorEntityUuid;
use crate::{
    knowledge::entity::id::EntityUuid,
    principal::{actor_group::WebId, role::RoleId},
};

/// A type-safe identifier for a user actor.
///
/// Branded [`ActorEntityUuid`] type that specifically represents user accounts,
/// providing compile-time guarantees when working with user identifiers.
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
pub struct UserId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorEntityUuid & WebId, \"UserId\">")
    )]
    ActorEntityUuid,
);

impl UserId {
    /// Creates a new [`UserId`] from any value that can be converted to a `Uuid`.
    ///
    /// Wraps the provided UUID in the appropriate branded type structure.
    #[must_use]
    pub fn new(actor_entity_uuid: impl Into<Uuid>) -> Self {
        Self(ActorEntityUuid::new(actor_entity_uuid))
    }
}

impl From<UserId> for ActorEntityUuid {
    fn from(user_id: UserId) -> Self {
        user_id.0
    }
}

impl From<UserId> for EntityUuid {
    fn from(user_id: UserId) -> Self {
        user_id.0.into()
    }
}

impl From<UserId> for Uuid {
    fn from(user_id: UserId) -> Self {
        user_id.0.into()
    }
}

impl From<UserId> for WebId {
    fn from(user_id: UserId) -> Self {
        Self::new(Uuid::from(user_id))
    }
}

/// A human user account within the system.
///
/// Represents a user with their unique identifier and assigned roles.
#[derive(Debug)]
pub struct User {
    pub id: UserId,
    pub roles: HashSet<RoleId>,
}
