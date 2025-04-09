mod subteam;
mod web;

use cedar_policy_core::ast;
use type_system::web::OwnedById;
use uuid::Uuid;

pub use self::{
    subteam::{Subteam, SubteamId},
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
#[serde(tag = "teamType", content = "id", rename_all = "lowercase")]
pub enum TeamId {
    Web(OwnedById),
    Subteam(SubteamId),
}

impl TeamId {
    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        match self {
            Self::Web(id) => id.into_uuid(),
            Self::Subteam(id) => id.into_uuid(),
        }
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        match self {
            Self::Web(id) => id.as_uuid(),
            Self::Subteam(id) => id.as_uuid(),
        }
    }

    pub(crate) fn to_euid(self) -> ast::EntityUID {
        match self {
            Self::Web(id) => id.to_euid(),
            Self::Subteam(id) => id.to_euid(),
        }
    }
}

#[derive(Debug)]
pub enum Team {
    Web(Web),
    Subteam(Subteam),
}

impl Team {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        match self {
            Self::Web(web) => web.to_cedar_entity(),
            Self::Subteam(subteam) => subteam.to_cedar_entity(),
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
                "type": "team",
            }),
            "missing field `teamType`",
        )
    }

    #[test]
    fn wrong_team_type() -> Result<(), Box<dyn Error>> {
        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "teamType": "wrong",
            }),
            "unknown variant `wrong`, expected `web` or `subteam`",
        )
    }
}
