mod team;
mod web;

use cedar_policy_core::ast;
use type_system::web::{ActorGroupEntityUuid, WebId};
use uuid::Uuid;

pub use self::{
    team::{Team, TeamId},
    web::Web,
};
use crate::policies::cedar::CedarEntityId as _;

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
#[serde(tag = "actorGroupType", content = "id", rename_all = "lowercase")]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub enum ActorGroupId {
    Web(WebId),
    Team(TeamId),
}

impl ActorGroupId {
    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        match self {
            Self::Web(id) => id.into_uuid(),
            Self::Team(id) => id.into_uuid(),
        }
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        match self {
            Self::Web(id) => id.as_uuid(),
            Self::Team(id) => id.as_uuid(),
        }
    }

    pub(crate) fn to_euid(self) -> ast::EntityUID {
        match self {
            Self::Web(id) => id.to_euid(),
            Self::Team(id) => id.to_euid(),
        }
    }
}

impl From<ActorGroupId> for ActorGroupEntityUuid {
    fn from(actor_group_id: ActorGroupId) -> Self {
        match actor_group_id {
            ActorGroupId::Web(id) => id.into(),
            ActorGroupId::Team(id) => id.into(),
        }
    }
}

#[derive(Debug)]
pub enum ActorGroup {
    Web(Web),
    Team(Team),
}

impl ActorGroup {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        match self {
            Self::Web(web) => web.to_cedar_entity(),
            Self::Team(team) => team.to_cedar_entity(),
        }
    }
}
#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;

    use crate::{policies::PrincipalConstraint, test_utils::check_deserialization_error};

    #[test]
    fn missing_team_type() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
            }),
            "missing field `actorGroupType`",
        )
    }

    #[test]
    fn wrong_actor_group_type() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "actorGroup",
                "actorGroupType": "wrong",
            }),
            "unknown variant `wrong`, expected `web` or `team`",
        )
    }
}
