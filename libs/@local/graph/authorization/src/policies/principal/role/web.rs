use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use type_system::web::WebId;
use uuid::Uuid;

use super::RoleName;
use crate::policies::cedar::CedarEntityId;

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
pub struct WebRoleId(Uuid);

impl WebRoleId {
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

impl CedarEntityId for WebRoleId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Web", "Role"]));
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
pub struct WebRole {
    pub id: WebRoleId,
    pub web_id: WebId,
    pub name: RoleName,
}

impl WebRole {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            iter::empty(),
            HashSet::from([self.web_id.to_euid()]),
            iter::empty(),
            Extensions::none(),
        )
        .expect("web role should be a valid Cedar entity")
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use uuid::Uuid;

    use super::WebRoleId;
    use crate::{
        policies::{
            PrincipalConstraint,
            principal::{role::RoleId, tests::check_principal},
        },
        test_utils::check_deserialization_error,
    };
    #[test]
    fn constraint() -> Result<(), Box<dyn Error>> {
        let web_role_id = WebRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Role {
                actor_type: None,
                role: RoleId::Web(web_role_id),
            },
            json!({
                "type": "role",
                "roleType": "web",
                "id": web_role_id,
            }),
            format!(r#"principal in HASH::Web::Role::"{web_role_id}""#),
        )
    }

    #[test]
    fn missing_id() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "web",
            }),
            "missing field `id`",
        )
    }

    #[test]
    fn unexpected_field() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "role",
                "roleType": "web",
                "id": Uuid::new_v4(),
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )
    }
}
