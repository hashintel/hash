use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use type_system::principal::{
    actor::{Ai, AiId},
    role::RoleId,
};
use uuid::Uuid;

use crate::policies::cedar::{FromCedarEntityId, ToCedarEntity, ToCedarEntityId};

impl FromCedarEntityId for AiId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        pub(crate) static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Ai"]));
        &ENTITY_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

impl ToCedarEntityId for AiId {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        Self::entity_type()
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }
}

impl ToCedarEntity for Ai {
    fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            iter::empty(),
            HashSet::new(),
            self.roles.iter().map(RoleId::to_euid).collect(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("Ai should be a valid Cedar entity")
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::principal::{
        actor::{ActorId, ActorType},
        actor_group::{ActorGroupId, TeamId, WebId},
        role::{RoleId, TeamRoleId, WebRoleId},
    };
    use uuid::Uuid;

    use super::AiId;
    use crate::{
        policies::{PrincipalConstraint, principal::tests::check_principal},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn any() -> Result<(), Box<dyn Error>> {
        check_principal(
            PrincipalConstraint::ActorType {
                actor_type: ActorType::Ai,
            },
            json!({
                "type": "actorType",
                "actorType": "ai",
            }),
            "principal is HASH::Ai",
        )?;

        Ok(())
    }

    #[test]
    fn exact() -> Result<(), Box<dyn Error>> {
        let ai_id = AiId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Actor {
                actor: ActorId::Ai(ai_id),
            },
            json!({
                "type": "actor",
                "actorType": "ai",
                "id": ai_id,
            }),
            format!(r#"principal == HASH::Ai::"{ai_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actor",
                "actorType": "ai",
                "id": ai_id,
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
                actor_type: Some(ActorType::Ai),
                actor_group: ActorGroupId::Web(web_id),
            },
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
                "actorType": "ai",
                "id": web_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
                "actorType": "ai",
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
                actor_type: Some(ActorType::Ai),
                actor_group: ActorGroupId::Team(team_id),
            },
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
                "actorType": "ai",
                "id": team_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Team::"{team_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
                "actorType": "ai",
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
                actor_type: Some(ActorType::Ai),
                role: RoleId::Web(web_role_id),
            },
            json!({
                "type": "role",
                "roleType": "web",
                "actorType": "ai",
                "id": web_role_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Web::Role::"{web_role_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "web",
                "actorType": "ai",
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
                actor_type: Some(ActorType::Ai),
                role: RoleId::Team(team_role_id),
            },
            json!({
                "type": "role",
                "roleType": "team",
                "actorType": "ai",
                "id": team_role_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Team::Role::"{team_role_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "team",
                "actorType": "ai",
                "id": team_role_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }
}
