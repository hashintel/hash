mod team;
mod web;

use alloc::sync::Arc;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _};
use type_system::principal::role::{Role, RoleId, TeamRoleId, WebRoleId};

use crate::policies::{
    cedar::{FromCedarEntityId as _, FromCedarEntityUId, ToCedarEntity, ToCedarEntityId},
    error::FromCedarRefernceError,
};

impl FromCedarEntityUId for RoleId {
    fn from_euid(euid: &ast::EntityUID) -> Result<Self, Report<FromCedarRefernceError>> {
        if *euid.entity_type() == **WebRoleId::entity_type() {
            WebRoleId::from_eid(euid.eid())
                .change_context(FromCedarRefernceError::InvalidCedarEntityId)
                .map(Self::Web)
        } else if *euid.entity_type() == **TeamRoleId::entity_type() {
            TeamRoleId::from_eid(euid.eid())
                .change_context(FromCedarRefernceError::InvalidCedarEntityId)
                .map(Self::Team)
        } else {
            Err(Report::new(FromCedarRefernceError::UnexpectedEntityType {
                actual: euid.entity_type().clone(),
            }))
        }
    }
}

impl ToCedarEntityId for RoleId {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        match self {
            Self::Web(web_role_id) => web_role_id.to_cedar_entity_type(),
            Self::Team(team_role_id) => team_role_id.to_cedar_entity_type(),
        }
    }

    fn to_eid(&self) -> ast::Eid {
        match self {
            Self::Web(web_role_id) => web_role_id.to_eid(),
            Self::Team(team_role_id) => team_role_id.to_eid(),
        }
    }
}

impl ToCedarEntity for Role {
    fn to_cedar_entity(&self) -> ast::Entity {
        match self {
            Self::Web(web_role) => web_role.to_cedar_entity(),
            Self::Team(team_role) => team_role.to_cedar_entity(),
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
            "unknown variant `wrong`, expected `web` or `team`",
        )
    }
}
