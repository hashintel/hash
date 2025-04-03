mod subteam;
mod web;

use cedar_policy_core::ast;
use uuid::Uuid;

pub use self::{
    subteam::{SubteamRole, SubteamRoleId},
    web::{WebRole, WebRoleId},
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
    tag = "roleType",
    content = "id",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum RoleId {
    Web(WebRoleId),
    Subteam(SubteamRoleId),
}

impl RoleId {
    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        match self {
            Self::Web(role_id) => role_id.as_uuid(),
            Self::Subteam(role_id) => role_id.as_uuid(),
        }
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        match self {
            Self::Web(role_id) => role_id.into_uuid(),
            Self::Subteam(role_id) => role_id.into_uuid(),
        }
    }

    pub(crate) fn to_euid(self) -> ast::EntityUID {
        match self {
            Self::Web(web_role_id) => web_role_id.to_euid(),
            Self::Subteam(role_id) => role_id.to_euid(),
        }
    }
}

#[derive(Debug)]
pub enum Role {
    Web(WebRole),
    Subteam(SubteamRole),
}

impl Role {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        match self {
            Self::Web(web_role) => web_role.to_cedar_entity(),
            Self::Subteam(subteam_role) => subteam_role.to_cedar_entity(),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;

    use crate::{policies::PrincipalConstraint, test_utils::check_deserialization_error};

    #[test]
    fn missing_role_type() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
            }),
            "missing field `roleType`",
        )
    }

    #[test]
    fn wrong_role_type() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "wrong",
            }),
            "unknown variant `wrong`, expected `web` or `subteam`",
        )
    }
}
