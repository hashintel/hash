use alloc::sync::Arc;
use core::str::FromStr as _;
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::ast;
use error_stack::Report;
use type_system::web::OwnedById;
use uuid::Uuid;

use crate::policies::{cedar::CedarEntityId, principal::role::WebRoleId};

impl CedarEntityId for OwnedById {
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
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

#[derive(Debug)]
pub struct Web {
    pub id: OwnedById,
    pub roles: HashSet<WebRoleId>,
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::web::OwnedById;
    use uuid::Uuid;

    use crate::{
        policies::{
            PrincipalConstraint,
            principal::{team::TeamId, tests::check_principal},
        },
        test_utils::check_deserialization_error,
    };
    #[test]
    fn constraint() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Team {
                actor_type: None,
                team: TeamId::Web(web_id),
            },
            json!({
                "type": "team",
                "teamType": "web",
                "id": web_id,
            }),
            format!(r#"principal in HASH::Web::"{web_id}""#),
        )
    }

    #[test]
    fn missing_id() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "teamType": "web",
            }),
            "missing field `id`",
        )
    }

    #[test]
    fn unexpected_field() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "teamType": "web",
                "id": Uuid::new_v4(),
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )
    }
}
