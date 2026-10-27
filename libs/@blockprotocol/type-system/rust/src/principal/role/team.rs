#[cfg(feature = "generate")]
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use uuid::Uuid;

use super::RoleName;
#[cfg(feature = "generate")]
use crate::generate_uuid;
use crate::principal::actor_group::TeamId;

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
pub struct TeamRoleId(#[serde(with = "hash_codec::serde::valid_uuid")] Uuid);

impl TeamRoleId {
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
        Self(uuid)
    }
}

impl From<TeamRoleId> for Uuid {
    fn from(team_role_id: TeamRoleId) -> Self {
        team_role_id.0
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TeamRole {
    pub id: TeamRoleId,
    pub team_id: TeamId,
    pub name: RoleName,
}
