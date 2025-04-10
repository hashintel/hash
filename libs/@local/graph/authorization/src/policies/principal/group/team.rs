use alloc::sync::Arc;
use core::{iter, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use type_system::principal::actor_group::{ActorGroupId, Team, TeamId};
use uuid::Uuid;

use crate::policies::cedar::{FromCedarEntityId, ToCedarEntity, ToCedarEntityId};

impl FromCedarEntityId for TeamId {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        pub(crate) static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Team"]));
        &ENTITY_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

impl ToCedarEntityId for TeamId {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        Self::entity_type()
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }
}

impl ToCedarEntity for Team {
    fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            iter::empty(),
            self.parents.iter().map(ActorGroupId::to_euid).collect(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("Team should be a valid Cedar entity")
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::principal::actor_group::{ActorGroupEntityUuid, ActorGroupId, TeamId};
    use uuid::Uuid;

    use crate::{
        policies::{PrincipalConstraint, principal::tests::check_principal},
        test_utils::check_deserialization_error,
    };
    #[test]
    fn constraint() -> Result<(), Box<dyn Error>> {
        let team_id = TeamId::new(ActorGroupEntityUuid::new(Uuid::new_v4()));
        check_principal(
            PrincipalConstraint::ActorGroup {
                actor_type: None,
                actor_group: ActorGroupId::Team(team_id),
            },
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
                "id": team_id,
            }),
            format!(r#"principal in HASH::Team::"{team_id}""#),
        )
    }

    #[test]
    fn missing_id() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
            }),
            "missing field `id`",
        )
    }

    #[test]
    fn unexpected_field() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "team",
                "id": Uuid::new_v4(),
                "additional": "unexpected",
            }),
            "unknown field `additional`",
        )
    }
}
