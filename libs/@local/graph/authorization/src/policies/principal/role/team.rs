use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::ast;
use error_stack::Report;
use type_system::principal::role::{TeamRole, TeamRoleId};
use uuid::Uuid;

use crate::policies::cedar::{FromCedarEntityId, ToCedarEntity, ToCedarEntityId};

impl FromCedarEntityId for TeamRoleId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        pub(crate) static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Team", "Role"]));
        &ENTITY_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

impl ToCedarEntityId for TeamRoleId {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        Self::entity_type()
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }
}

impl ToCedarEntity for TeamRole {
    fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new_with_attr_partial_value(
            self.id.to_euid(),
            iter::empty(),
            HashSet::new(),
            HashSet::from([self.team_id.to_euid()]),
            iter::empty(),
        )
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::principal::role::{RoleId, TeamRoleId};
    use uuid::Uuid;

    use crate::{
        policies::{PrincipalConstraint, principal::tests::check_principal},
        test_utils::check_deserialization_error,
    };
    #[test]
    fn constraint() -> Result<(), Box<dyn Error>> {
        let team_role_id = TeamRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Role {
                actor_type: None,
                role: RoleId::Team(team_role_id),
            },
            json!({
                "type": "role",
                "roleType": "team",
                "id": team_role_id,
            }),
            format!(r#"principal in HASH::Team::Role::"{team_role_id}""#),
        )
    }

    #[test]
    fn missing_id() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "team",
            }),
            "missing field `id`",
        )
    }

    #[test]
    fn unexpected_field() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "team",
                "id": Uuid::new_v4(),
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )
    }
}
