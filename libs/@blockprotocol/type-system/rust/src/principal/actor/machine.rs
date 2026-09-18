use std::collections::HashSet;

use uuid::Uuid;

use super::ActorEntityUuid;
use crate::{knowledge::entity::id::EntityUuid, principal::role::RoleId};

/// A type-safe identifier for a machine actor.
///
/// Branded [`ActorEntityUuid`] type that specifically represents machine actors,
/// providing compile-time guarantees when working with machine identifiers.
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
    feature = "schemars",
    derive(schemars::JsonSchema),
    schemars(inline, description = "The UUID of a machine actor.")
)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct MachineId(ActorEntityUuid);

impl MachineId {
    #[must_use]
    pub fn new(actor_entity_uuid: impl Into<Uuid>) -> Self {
        Self(ActorEntityUuid::new(actor_entity_uuid))
    }
}

impl From<MachineId> for ActorEntityUuid {
    fn from(machine_id: MachineId) -> Self {
        machine_id.0
    }
}

impl From<MachineId> for EntityUuid {
    fn from(machine_id: MachineId) -> Self {
        machine_id.0.into()
    }
}

impl From<MachineId> for Uuid {
    fn from(machine_id: MachineId) -> Self {
        machine_id.0.into()
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Machine {
    pub id: MachineId,
    pub identifier: String,
    #[cfg_attr(feature = "codegen", specta(skip))]
    pub roles: HashSet<RoleId>,
}
