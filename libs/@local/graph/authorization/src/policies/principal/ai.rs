#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

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

use super::{InPrincipalConstraint, TeamPrincipalConstraint, role::RoleId};
use crate::policies::{cedar::CedarEntityId, principal::web::WebPrincipalConstraint};

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
    #[expect(
        dead_code,
        reason = "Will be used when AI authorization is fully implemented"
    )]
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

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum AiPrincipalConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
    Any {},
    Exact {
        #[serde(deserialize_with = "Option::deserialize")]
        ai_id: Option<AiId>,
    },
    Web(WebPrincipalConstraint),
    Team(TeamPrincipalConstraint),
}

impl AiPrincipalConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Any {} | Self::Exact { ai_id: Some(_) } => false,
            Self::Exact { ai_id: None } => true,
            Self::Web(web) => web.has_slot(),
            Self::Team(team) => team.has_slot(),
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::PrincipalConstraint {
        match self {
            Self::Any {} => {
                ast::PrincipalConstraint::is_entity_type(Arc::clone(AiId::entity_type()))
            }
            Self::Exact { ai_id } => ai_id
                .map_or_else(ast::PrincipalConstraint::is_eq_slot, |ai_id| {
                    ast::PrincipalConstraint::is_eq(Arc::new(ai_id.to_euid()))
                }),
            Self::Web(web) => web.to_cedar_in_type::<AiId>(),
            Self::Team(team) => team.to_cedar_in_type::<AiId>(),
        }
    }
}

impl From<InPrincipalConstraint> for AiPrincipalConstraint {
    fn from(value: InPrincipalConstraint) -> Self {
        match value {
            InPrincipalConstraint::Web(web) => Self::Web(web),
            InPrincipalConstraint::Team(team) => Self::Team(team),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::{
        knowledge::entity::id::EntityUuid, provenance::ActorEntityUuid, web::OwnedById,
    };
    use uuid::Uuid;

    use super::{AiId, WebPrincipalConstraint};
    use crate::{
        policies::{
            PrincipalConstraint,
            principal::{AiPrincipalConstraint, tests::check_principal, web::WebRoleId},
        },
        test_utils::check_deserialization_error,
    };

    #[test]
    fn any() -> Result<(), Box<dyn Error>> {
        check_principal(
            PrincipalConstraint::Ai(AiPrincipalConstraint::Any {}),
            json!({
                "type": "ai",
            }),
            "principal is HASH::Ai",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "ai",
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum AiPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn exact() -> Result<(), Box<dyn Error>> {
        let ai_id = AiId::new(ActorEntityUuid::new(EntityUuid::new(Uuid::new_v4())));
        check_principal(
            PrincipalConstraint::Ai(AiPrincipalConstraint::Exact { ai_id: Some(ai_id) }),
            json!({
                "type": "ai",
                "aiId": ai_id,
            }),
            format!(r#"principal == HASH::Ai::"{ai_id}""#),
        )?;

        check_principal(
            PrincipalConstraint::Ai(AiPrincipalConstraint::Exact { ai_id: None }),
            json!({
                "type": "ai",
                "aiId": null,
            }),
            "principal == ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "ai",
                "id": ai_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum AiPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn organization() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Ai(AiPrincipalConstraint::Web(WebPrincipalConstraint::InWeb {
                id: Some(web_id),
            })),
            json!({
                "type": "ai",
                "id": web_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Web::"{web_id}""#),
        )?;

        check_principal(
            PrincipalConstraint::Ai(AiPrincipalConstraint::Web(WebPrincipalConstraint::InWeb {
                id: None,
            })),
            json!({
                "type": "ai",
                "id": null,
            }),
            "principal is HASH::Ai in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "ai",
                "id": web_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum AiPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn organization_role() -> Result<(), Box<dyn Error>> {
        let web_role_id = WebRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Ai(AiPrincipalConstraint::Web(WebPrincipalConstraint::InRole {
                role_id: Some(web_role_id),
            })),
            json!({
                "type": "ai",
                "roleId": web_role_id,
            }),
            format!(r#"principal is HASH::Ai in HASH::Web::Role::"{web_role_id}""#),
        )?;

        check_principal(
            PrincipalConstraint::Ai(AiPrincipalConstraint::Web(WebPrincipalConstraint::InRole {
                role_id: None,
            })),
            json!({
                "type": "ai",
                "roleId": null,
            }),
            "principal is HASH::Ai in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "ai",
                "webRoleId": web_role_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum AiPrincipalConstraint",
        )?;

        Ok(())
    }
}
