use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use smol_str::SmolStr;
use type_system::principal::{
    actor::{User, UserId},
    role::RoleId,
};
use uuid::Uuid;

use crate::policies::cedar::{
    FromCedarEntityId, ToCedarEntity, ToCedarEntityId, ToCedarRestrictedExpr,
};

impl ToCedarRestrictedExpr for UserId {
    fn to_cedar_restricted_expr(&self) -> ast::RestrictedExpr {
        ast::RestrictedExpr::record([
            (
                SmolStr::new_static("id"),
                ast::RestrictedExpr::val(self.to_string()),
            ),
            (
                SmolStr::new_static("type"),
                ast::RestrictedExpr::val("user"),
            ),
        ])
        .expect("No duplicate keys in user record")
    }
}

impl FromCedarEntityId for UserId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        pub(crate) static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["User"]));
        &ENTITY_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

impl ToCedarEntityId for UserId {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        Self::entity_type()
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }
}

impl ToCedarEntity for User {
    fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            [(
                SmolStr::new_static("id"),
                self.id.to_cedar_restricted_expr(),
            )],
            HashSet::new(),
            self.roles.iter().map(RoleId::to_euid).collect(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("User should be a valid Cedar entity")
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::principal::{
        actor::{ActorId, ActorType, UserId},
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
                actor_type: ActorType::User,
            },
            json!({
                "type": "actorType",
                "actorType": "user",
            }),
            "principal is HASH::User",
        )?;

        Ok(())
    }

    #[test]
    fn exact() -> Result<(), Box<dyn Error>> {
        let user_id = UserId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Actor {
                actor: ActorId::User(user_id),
            },
            json!({
                "type": "actor",
                "actorType": "user",
                "id": user_id,
            }),
            format!(r#"principal == HASH::User::"{user_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actor",
                "actorType": "user",
                "id": user_id,
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
                actor_type: Some(ActorType::User),
                actor_group: ActorGroupId::Web(web_id),
            },
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
                "actorType": "user",
                "id": web_id,
            }),
            format!(r#"principal is HASH::User in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
                "actorType": "user",
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
                actor_type: Some(ActorType::User),
                actor_group: ActorGroupId::Team(team_id),
            },
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
                "actorType": "user",
                "id": team_id,
            }),
            format!(r#"principal is HASH::User in HASH::Team::"{team_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
                "actorType": "user",
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
                actor_type: Some(ActorType::User),
                role: RoleId::Web(web_role_id),
            },
            json!({
                "type": "role",
                "roleType": "web",
                "actorType": "user",
                "id": web_role_id,
            }),
            format!(r#"principal is HASH::User in HASH::Web::Role::"{web_role_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "web",
                "actorType": "user",
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
                actor_type: Some(ActorType::User),
                role: RoleId::Team(team_role_id),
            },
            json!({
                "type": "role",
                "roleType": "team",
                "actorType": "user",
                "id": team_role_id,
            }),
            format!(r#"principal is HASH::User in HASH::Team::Role::"{team_role_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "team",
                "actorType": "user",
                "id": team_role_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }
}
