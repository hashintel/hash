use cedar_policy_core::ast;
use uuid::Uuid;

use super::{
    team::{StandaloneTeamRole, StandaloneTeamRoleId, SubteamRole},
    web::{SubteamRoleId, WebRole, WebRoleId},
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
    Standalone(StandaloneTeamRoleId),
    Subteam(SubteamRoleId),
}

impl RoleId {
    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        match self {
            Self::Standalone(role_id) => role_id.as_uuid(),
            Self::Web(role_id) => role_id.as_uuid(),
            Self::Subteam(role_id) => role_id.as_uuid(),
        }
    }

    pub(crate) fn to_euid(self) -> ast::EntityUID {
        match self {
            Self::Standalone(role_id) => role_id.to_euid(),
            Self::Web(web_role_id) => web_role_id.to_euid(),
            Self::Subteam(role_id) => role_id.to_euid(),
        }
    }
}

#[derive(Debug)]
pub enum Role {
    Web(WebRole),
    Standalone(StandaloneTeamRole),
    Subteam(SubteamRole),
}
