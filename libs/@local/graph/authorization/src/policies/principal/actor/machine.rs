use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::ast;
use error_stack::Report;
use smol_str::SmolStr;
use type_system::principal::{
    actor::{Machine, MachineId},
    role::RoleId,
};
use uuid::Uuid;

use crate::policies::cedar::{FromCedarEntityId, ToCedarEntity, ToCedarEntityId, ToCedarValue};

impl ToCedarValue for MachineId {
    fn to_cedar_value(&self) -> ast::Value {
        ast::Value::record(
            [
                (SmolStr::new_static("id"), SmolStr::new(self.to_string())),
                (SmolStr::new_static("type"), SmolStr::new_static("machine")),
            ],
            None,
        )
    }
}

impl FromCedarEntityId for MachineId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        pub(crate) static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Machine"]));
        &ENTITY_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

impl ToCedarEntityId for MachineId {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        Self::entity_type()
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }
}

impl ToCedarEntity for Machine {
    fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new_with_attr_partial_value(
            self.id.to_euid(),
            [(
                SmolStr::new_static("id"),
                ast::PartialValue::Value(self.id.to_cedar_value()),
            )],
            HashSet::new(),
            self.roles.iter().map(RoleId::to_euid).collect(),
            iter::empty(),
        )
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::principal::{
        actor::{ActorId, ActorType, MachineId},
        actor_group::{ActorGroupId, TeamId, WebId},
        role::{RoleId, TeamRoleId, WebRoleId},
    };
    use uuid::Uuid;

    use crate::{
        policies::{PrincipalConstraint, principal::tests::check_principal},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn any() -> Result<(), Box<dyn Error>> {
        check_principal(
            PrincipalConstraint::ActorType {
                actor_type: ActorType::Machine,
            },
            json!({
                "type": "actorType",
                "actorType": "machine",
            }),
            "principal is HASH::Machine",
        )?;

        Ok(())
    }

    #[test]
    fn exact() -> Result<(), Box<dyn Error>> {
        let machine_id = MachineId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Actor {
                actor: ActorId::Machine(machine_id),
            },
            json!({
                "type": "actor",
                "actorType": "machine",
                "id": machine_id,
            }),
            format!(r#"principal == HASH::Machine::"{machine_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actor",
                "actorType": "machine",
                "id": machine_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }

    #[test]
    fn web() -> Result<(), Box<dyn Error>> {
        let web_id = WebId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::ActorGroup {
                actor_type: Some(ActorType::Machine),
                actor_group: ActorGroupId::Web(web_id),
            },
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
                "actorType": "machine",
                "id": web_id,
            }),
            format!(r#"principal is HASH::Machine in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
                "actorType": "machine",
                "id": web_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }

    #[test]
    fn team() -> Result<(), Box<dyn Error>> {
        let team_id = TeamId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::ActorGroup {
                actor_type: Some(ActorType::Machine),
                actor_group: ActorGroupId::Team(team_id),
            },
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
                "actorType": "machine",
                "id": team_id,
            }),
            format!(r#"principal is HASH::Machine in HASH::Team::"{team_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
                "actorType": "machine",
                "id": team_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }

    #[test]
    fn web_role() -> Result<(), Box<dyn Error>> {
        let web_role_id = WebRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Role {
                actor_type: Some(ActorType::Machine),
                role: RoleId::Web(web_role_id),
            },
            json!({
                "type": "role",
                "roleType": "web",
                "actorType": "machine",
                "id": web_role_id,
            }),
            format!(r#"principal is HASH::Machine in HASH::Web::Role::"{web_role_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "web",
                "actorType": "machine",
                "id": web_role_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }

    #[test]
    fn team_role() -> Result<(), Box<dyn Error>> {
        let team_role_id = TeamRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Role {
                actor_type: Some(ActorType::Machine),
                role: RoleId::Team(team_role_id),
            },
            json!({
                "type": "role",
                "roleType": "team",
                "actorType": "machine",
                "id": team_role_id,
            }),
            format!(r#"principal is HASH::Machine in HASH::Team::Role::"{team_role_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "team",
                "actorType": "machine",
                "id": team_role_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }
}
