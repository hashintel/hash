use std::collections::HashSet;

#[cfg(feature = "generate")]
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use uuid::Uuid;

use super::ActorEntityUuid;
#[cfg(feature = "generate")]
use crate::generate_uuid;
use crate::{knowledge::entity::id::EntityUuid, principal::role::RoleId};

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
    /// Generates a new ID that carries `transaction_time`, as described in [`generate_uuid`].
    ///
    /// Returns `None` if `transaction_time` lies before the Unix epoch.
    #[cfg(feature = "generate")]
    #[must_use]
    pub fn new(transaction_time: Timestamp<TransactionTime>) -> Option<Self> {
        generate_uuid(transaction_time).map(Self::from_uuid)
    }

    /// Creates an ID from an existing UUID.
    #[must_use]
    pub const fn from_uuid(uuid: Uuid) -> Self {
        Self(ActorEntityUuid::from_uuid(uuid))
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
