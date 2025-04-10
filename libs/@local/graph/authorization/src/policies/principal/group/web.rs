use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use type_system::{knowledge::entity::id::EntityUuid, web::WebId};
use uuid::Uuid;

use crate::policies::{cedar::CedarEntityId, principal::role::WebRoleId};

impl CedarEntityId for WebId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Web"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.as_uuid().to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(EntityUuid::new(Uuid::from_str(eid.as_ref())?)))
    }
}

#[derive(Debug)]
pub struct Web {
    pub id: WebId,
    pub roles: HashSet<WebRoleId>,
}

impl Web {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            iter::empty(),
            HashSet::new(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("web should be a valid Cedar entity")
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::{knowledge::entity::id::EntityUuid, web::WebId};
    use uuid::Uuid;

    use crate::{
        policies::{
            PrincipalConstraint,
            principal::{group::ActorGroupId, tests::check_principal},
        },
        test_utils::check_deserialization_error,
    };
    #[test]
    fn constraint() -> Result<(), Box<dyn Error>> {
        let web_id = WebId::new(EntityUuid::new(Uuid::new_v4()));
        check_principal(
            PrincipalConstraint::ActorGroup {
                actor_type: None,
                actor_group: ActorGroupId::Web(web_id),
            },
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
                "id": web_id,
            }),
            format!(r#"principal in HASH::Web::"{web_id}""#),
        )
    }

    #[test]
    fn missing_id() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
            }),
            "missing field `id`",
        )
    }

    #[test]
    fn unexpected_field() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "web",
                "id": Uuid::new_v4(),
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )
    }
}
