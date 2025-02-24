use alloc::sync::Arc;
use core::{error::Error, fmt, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::Report;
use uuid::Uuid;

use crate::policies::cedar::CedarEntityId;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::FromSql, postgres_types::ToSql),
    postgres(transparent)
)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct TeamId(Uuid);

impl TeamId {
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

impl fmt::Display for TeamId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CedarEntityId for TeamId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Team"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.0.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::FromSql, postgres_types::ToSql),
    postgres(transparent)
)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct TeamRoleId(Uuid);

impl TeamRoleId {
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

impl fmt::Display for TeamRoleId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CedarEntityId for TeamRoleId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Team", "Role"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.0.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum TeamPrincipalConstraint {
    InTeam {
        #[serde(deserialize_with = "Option::deserialize")]
        id: Option<TeamId>,
    },
    InRole {
        #[serde(deserialize_with = "Option::deserialize")]
        role_id: Option<TeamRoleId>,
    },
}

impl TeamPrincipalConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::InTeam { id: Some(_) } | Self::InRole { role_id: Some(_) } => false,
            Self::InTeam { id: None } | Self::InRole { role_id: None } => true,
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::PrincipalConstraint {
        match self {
            Self::InTeam { id } => id.map_or_else(ast::PrincipalConstraint::is_in_slot, |id| {
                ast::PrincipalConstraint::is_in(Arc::new(id.to_euid()))
            }),
            Self::InRole { role_id } => role_id
                .map_or_else(ast::PrincipalConstraint::is_in_slot, |role_id| {
                    ast::PrincipalConstraint::is_in(Arc::new(role_id.to_euid()))
                }),
        }
    }

    #[must_use]
    pub(crate) fn to_cedar_in_type<C: CedarEntityId>(&self) -> ast::PrincipalConstraint {
        match self {
            Self::InTeam { id } => id.map_or_else(
                || ast::PrincipalConstraint::is_entity_type_in_slot(Arc::clone(C::entity_type())),
                |id| {
                    ast::PrincipalConstraint::is_entity_type_in(
                        Arc::clone(C::entity_type()),
                        Arc::new(id.to_euid()),
                    )
                },
            ),
            Self::InRole { role_id } => role_id.map_or_else(
                || ast::PrincipalConstraint::is_entity_type_in_slot(Arc::clone(C::entity_type())),
                |role_id| {
                    ast::PrincipalConstraint::is_entity_type_in(
                        Arc::clone(C::entity_type()),
                        Arc::new(role_id.to_euid()),
                    )
                },
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use uuid::Uuid;

    use super::{TeamId, TeamPrincipalConstraint, TeamRoleId};
    use crate::{
        policies::{PrincipalConstraint, principal::tests::check_principal},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn in_team() -> Result<(), Box<dyn Error>> {
        let team_id = TeamId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Team(TeamPrincipalConstraint::InTeam { id: Some(team_id) }),
            json!({
                "type": "team",
                "id": team_id,
            }),
            format!(r#"principal in HASH::Team::"{team_id}""#),
        )?;

        check_principal(
            PrincipalConstraint::Team(TeamPrincipalConstraint::InTeam { id: None }),
            json!({
                "type": "team",
                "id": null,
            }),
            "principal in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
            }),
            "data did not match any variant of untagged enum TeamPrincipalConstraint",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "id": team_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum TeamPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn in_role() -> Result<(), Box<dyn Error>> {
        let role_id = TeamRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Team(TeamPrincipalConstraint::InRole {
                role_id: Some(role_id),
            }),
            json!({
                "type": "team",
                "roleId": role_id,
            }),
            format!(r#"principal in HASH::Team::Role::"{role_id}""#),
        )?;

        check_principal(
            PrincipalConstraint::Team(TeamPrincipalConstraint::InRole { role_id: None }),
            json!({
                "type": "team",
                "roleId": null,
            }),
            "principal in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "team",
                "roleId": role_id,
                "id": Uuid::new_v4(),
            }),
            "data did not match any variant of untagged enum TeamPrincipalConstraint",
        )?;

        Ok(())
    }
}
