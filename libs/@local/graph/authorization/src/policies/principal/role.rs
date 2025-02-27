use cedar_policy_core::ast;

use super::{
    team::TeamRoleId,
    web::{WebRoleId, WebTeamRoleId},
};
use crate::policies::cedar::CedarEntityId as _;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum RoleId {
    Web(WebRoleId),
    WebTeam(WebTeamRoleId),
    Team(TeamRoleId),
}

impl RoleId {
    pub(crate) fn to_euid(&self) -> ast::EntityUID {
        match self {
            Self::Web(web_role_id) => web_role_id.to_euid(),
            Self::WebTeam(web_team_role_id) => web_team_role_id.to_euid(),
            Self::Team(team_role_id) => team_role_id.to_euid(),
        }
    }
}
