use cedar_policy_core::ast;
use uuid::Uuid;

use super::{
    team::TeamRoleId,
    web::{WebRoleId, WebTeamRoleId},
};
use crate::policies::cedar::CedarEntityId as _;

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
#[serde(
    tag = "type",
    content = "id",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum RoleId {
    Web(WebRoleId),
    WebTeam(WebTeamRoleId),
    Team(TeamRoleId),
}

impl RoleId {
    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        match self {
            Self::Web(web_role_id) => web_role_id.as_uuid(),
            Self::WebTeam(web_team_role_id) => web_team_role_id.as_uuid(),
            Self::Team(team_role_id) => team_role_id.as_uuid(),
        }
    }

    pub(crate) fn to_euid(self) -> ast::EntityUID {
        match self {
            Self::Web(web_role_id) => web_role_id.to_euid(),
            Self::WebTeam(web_team_role_id) => web_team_role_id.to_euid(),
            Self::Team(team_role_id) => team_role_id.to_euid(),
        }
    }
}
