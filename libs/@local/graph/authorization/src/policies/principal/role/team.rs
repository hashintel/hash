use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use uuid::Uuid;

use super::RoleName;
use crate::policies::{cedar::CedarEntityId, principal::group::TeamId};

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
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct TeamRoleId(Uuid);

impl TeamRoleId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

impl CedarEntityId for TeamRoleId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Team", "Role"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.0.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

#[derive(Debug)]
pub struct TeamRole {
    pub id: TeamRoleId,
    pub team_id: TeamId,
    pub name: RoleName,
}

impl TeamRole {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            iter::empty(),
            HashSet::from([self.team_id.to_euid()]),
            iter::empty(),
            Extensions::none(),
        )
        .expect("team role should be a valid Cedar entity")
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use uuid::Uuid;

    use super::TeamRoleId;
    use crate::{
        policies::{
            PrincipalConstraint,
            principal::{role::RoleId, tests::check_principal},
        },
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
