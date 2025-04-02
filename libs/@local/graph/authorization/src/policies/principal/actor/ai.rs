use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, AiId},
};
use uuid::Uuid;

use crate::policies::{cedar::CedarEntityId, principal::role::RoleId};

impl CedarEntityId for AiId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Ai"]));
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
pub struct Ai {
    pub id: AiId,
    pub roles: HashSet<RoleId>,
}

impl Ai {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            iter::empty(),
            self.roles.iter().copied().map(RoleId::to_euid).collect(),
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
    use type_system::{
        knowledge::entity::id::EntityUuid,
        provenance::{ActorEntityUuid, ActorId, ActorType},
        web::OwnedById,
    };
    use uuid::Uuid;

    use super::AiId;
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
        let ai_id = AiId::new(ActorEntityUuid::new(EntityUuid::new(Uuid::new_v4())));
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
        let web_id = OwnedById::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Team {
                actor_type: Some(ActorType::Ai),
                team: TeamId::Web(web_id),
            },
            json!({
                "type": "team",
                "teamType": "web",
                "actorType": "ai",
                "id": web_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "teamType": "web",
                "actorType": "ai",
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
                actor_type: Some(ActorType::Ai),
                team: TeamId::Subteam(subteam_id),
            },
            json!({
                "type": "team",
                "teamType": "subteam",
                "actorType": "ai",
                "id": subteam_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Subteam::"{subteam_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "teamType": "subteam",
                "actorType": "ai",
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
    fn subteam_role() -> Result<(), Box<dyn Error>> {
        let subteam_role_id = SubteamRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Role {
                actor_type: Some(ActorType::Ai),
                role: RoleId::Subteam(subteam_role_id),
            },
            json!({
                "type": "role",
                "roleType": "subteam",
                "actorType": "ai",
                "id": subteam_role_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Subteam::Role::"{subteam_role_id}""#),
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "subteam",
                "actorType": "ai",
                "id": subteam_role_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )?;

        Ok(())
    }
}
