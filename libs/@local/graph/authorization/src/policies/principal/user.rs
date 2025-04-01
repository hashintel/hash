#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use type_system::provenance::{ActorEntityUuid, UserId};
use uuid::Uuid;

use super::{InPrincipalConstraint, TeamPrincipalConstraint, role::RoleId};
use crate::policies::{cedar::CedarEntityId, principal::web::WebPrincipalConstraint};

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
        Ok(Self::new(ActorEntityUuid::new(Uuid::from_str(
            eid.as_ref(),
        )?)))
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

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum UserPrincipalConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
    Any {},
    Exact {
        #[serde(deserialize_with = "Option::deserialize")]
        user_id: Option<UserId>,
    },
    Web(WebPrincipalConstraint),
    Team(TeamPrincipalConstraint),
}

impl UserPrincipalConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Any {} | Self::Exact { user_id: Some(_) } => false,
            Self::Exact { user_id: None } => true,
            Self::Web(web) => web.has_slot(),
            Self::Team(team) => team.has_slot(),
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::PrincipalConstraint {
        match self {
            Self::Any {} => {
                ast::PrincipalConstraint::is_entity_type(Arc::clone(UserId::entity_type()))
            }
            Self::Exact { user_id } => user_id
                .map_or_else(ast::PrincipalConstraint::is_eq_slot, |user_id| {
                    ast::PrincipalConstraint::is_eq(Arc::new(user_id.to_euid()))
                }),
            Self::Web(web) => web.to_cedar_in_type::<UserId>(),
            Self::Team(team) => team.to_cedar_in_type::<UserId>(),
        }
    }
}

impl From<InPrincipalConstraint> for UserPrincipalConstraint {
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
    use type_system::{provenance::ActorEntityUuid, web::OwnedById};
    use uuid::Uuid;

    use super::{UserId, WebPrincipalConstraint};
    use crate::{
        policies::{
            PrincipalConstraint,
            principal::{UserPrincipalConstraint, tests::check_principal, web::WebRoleId},
        },
        test_utils::check_deserialization_error,
    };

    #[test]
    fn any() -> Result<(), Box<dyn Error>> {
        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Any {}),
            json!({
                "type": "user",
            }),
            "principal is HASH::User",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum UserPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn exact() -> Result<(), Box<dyn Error>> {
        let user_id = UserId::new(ActorEntityUuid::new(Uuid::new_v4()));
        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Exact {
                user_id: Some(user_id),
            }),
            json!({
                "type": "user",
                "userId": user_id,
            }),
            format!(r#"principal == HASH::User::"{user_id}""#),
        )?;

        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Exact { user_id: None }),
            json!({
                "type": "user",
                "userId": null,
            }),
            "principal == ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "userId": user_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum UserPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn organization() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Web(
                WebPrincipalConstraint::InWeb { id: Some(web_id) },
            )),
            json!({
                "type": "user",
                "id": web_id,
            }),
            format!(r#"principal is HASH::User in HASH::Web::"{web_id}""#),
        )?;

        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Web(
                WebPrincipalConstraint::InWeb { id: None },
            )),
            json!({
                "type": "user",
                "id": null,
            }),
            "principal is HASH::User in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "id": web_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum UserPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn organization_role() -> Result<(), Box<dyn Error>> {
        let web_role_id = WebRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Web(
                WebPrincipalConstraint::InRole {
                    role_id: Some(web_role_id),
                },
            )),
            json!({
                "type": "user",
                "roleId": web_role_id,
            }),
            format!(r#"principal is HASH::User in HASH::Web::Role::"{web_role_id}""#),
        )?;

        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Web(
                WebPrincipalConstraint::InRole { role_id: None },
            )),
            json!({
                "type": "user",
                "roleId": null,
            }),
            "principal is HASH::User in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "webRoleId": web_role_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum UserPrincipalConstraint",
        )?;

        Ok(())
    }
}
