use uuid::Uuid;

use super::RoleName;
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
pub struct TeamRoleId(Uuid);

impl TeamRoleId {
    #[must_use]
    pub fn new(uuid: impl Into<Uuid>) -> Self {
        Self(uuid.into())
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
