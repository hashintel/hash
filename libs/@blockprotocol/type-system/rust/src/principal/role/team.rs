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
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct TeamRoleId(
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Brand<string, \"TeamRoleId\">"))] Uuid,
);

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

#[derive(Debug)]
pub struct TeamRole {
    pub id: TeamRoleId,
    pub team_id: TeamId,
    pub name: RoleName,
}
