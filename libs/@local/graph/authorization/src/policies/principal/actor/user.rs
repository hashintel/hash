use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, UserId},
};
use uuid::Uuid;

use crate::policies::{cedar::CedarEntityId, principal::role::RoleId};

impl CedarEntityId for UserId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["User"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.as_uuid().to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(ActorEntityUuid::new(EntityUuid::new(
            Uuid::from_str(eid.as_ref())?,
        ))))
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct User {
    pub id: UserId,
    pub roles: HashSet<RoleId>,
}

impl User {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            iter::empty(),
            self.roles.iter().copied().map(RoleId::to_euid).collect(),
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
    use type_system::{
        knowledge::entity::id::EntityUuid,
        provenance::{ActorEntityUuid, ActorId, ActorType, UserId},
        web::OwnedById,
    };
    use uuid::Uuid;

    use crate::{
        policies::{
            PrincipalConstraint,
            principal::{
                role::{RoleId, SubteamRoleId, WebRoleId},
                team::{SubteamId, TeamId},
                tests::check_principal,
            },
        },
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
        let user_id = UserId::new(ActorEntityUuid::new(EntityUuid::new(Uuid::new_v4())));
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
        let web_id = OwnedById::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Team {
                actor_type: Some(ActorType::User),
                team: TeamId::Web(web_id),
            },
            json!({
                "type": "team",
                "teamType": "web",
                "actorType": "user",
                "id": web_id,
            }),
            format!(r#"principal is HASH::User in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "teamType": "web",
                "actorType": "user",
                "id": web_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }

    #[test]
    fn subteam() -> Result<(), Box<dyn Error>> {
        let subteam_id = SubteamId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Team {
                actor_type: Some(ActorType::User),
                team: TeamId::Subteam(subteam_id),
            },
            json!({
                "type": "team",
                "teamType": "subteam",
                "actorType": "user",
                "id": subteam_id,
            }),
            format!(r#"principal is HASH::User in HASH::Subteam::"{subteam_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "teamType": "subteam",
                "actorType": "user",
                "id": subteam_id,
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
    fn subteam_role() -> Result<(), Box<dyn Error>> {
        let subteam_role_id = SubteamRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Role {
                actor_type: Some(ActorType::User),
                role: RoleId::Subteam(subteam_role_id),
            },
            json!({
                "type": "role",
                "roleType": "subteam",
                "actorType": "user",
                "id": subteam_role_id,
            }),
            format!(r#"principal is HASH::User in HASH::Subteam::Role::"{subteam_role_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "subteam",
                "actorType": "user",
                "id": subteam_role_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }
}
