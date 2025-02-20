use alloc::sync::Arc;
use core::{error::Error, fmt, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::Report;
use hash_graph_types::owned_by_id::OwnedById;
use uuid::Uuid;

use crate::policies::cedar::CedarEntityId;

impl CedarEntityId for OwnedById {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Web"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.as_uuid().to_string())
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

impl fmt::Display for WebRoleId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CedarEntityId for WebRoleId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Web", "Role"]));
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
pub struct WebTeamId(Uuid);

impl WebTeamId {
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

impl fmt::Display for WebTeamId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CedarEntityId for WebTeamId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Web", "Team"]));
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
pub struct WebTeamRoleId(Uuid);

impl WebTeamRoleId {
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

impl fmt::Display for WebTeamRoleId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CedarEntityId for WebTeamRoleId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Web", "Team", "Role"]));
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
pub enum WebPrincipalConstraint {
    InWeb {
        #[serde(deserialize_with = "Option::deserialize")]
        id: Option<OwnedById>,
    },
    InRole {
        #[serde(deserialize_with = "Option::deserialize")]
        role_id: Option<WebRoleId>,
    },
    InTeam {
        #[serde(deserialize_with = "Option::deserialize")]
        team_id: Option<WebTeamId>,
    },
    InTeamRole {
        #[serde(deserialize_with = "Option::deserialize")]
        team_role_id: Option<WebTeamRoleId>,
    },
}

impl WebPrincipalConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::InWeb { id: Some(_) }
            | Self::InRole { role_id: Some(_) }
            | Self::InTeam { team_id: Some(_) }
            | Self::InTeamRole {
                team_role_id: Some(_),
            } => false,
            Self::InWeb { id: None }
            | Self::InRole { role_id: None }
            | Self::InTeam { team_id: None }
            | Self::InTeamRole { team_role_id: None } => true,
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::PrincipalConstraint {
        match self {
            Self::InWeb { id } => id.map_or_else(ast::PrincipalConstraint::is_in_slot, |id| {
                ast::PrincipalConstraint::is_in(Arc::new(id.to_euid()))
            }),
            Self::InRole { role_id } => role_id
                .map_or_else(ast::PrincipalConstraint::is_in_slot, |role_id| {
                    ast::PrincipalConstraint::is_in(Arc::new(role_id.to_euid()))
                }),
            Self::InTeam { team_id } => team_id
                .map_or_else(ast::PrincipalConstraint::is_in_slot, |team_id| {
                    ast::PrincipalConstraint::is_in(Arc::new(team_id.to_euid()))
                }),
            Self::InTeamRole { team_role_id } => team_role_id
                .map_or_else(ast::PrincipalConstraint::is_in_slot, |team_role_id| {
                    ast::PrincipalConstraint::is_in(Arc::new(team_role_id.to_euid()))
                }),
        }
    }

    #[must_use]
    pub(crate) fn to_cedar_in_type<C: CedarEntityId>(&self) -> ast::PrincipalConstraint {
        match self {
            Self::InWeb { id } => id.map_or_else(
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
            Self::InTeam { team_id } => team_id.map_or_else(
                || ast::PrincipalConstraint::is_entity_type_in_slot(Arc::clone(C::entity_type())),
                |team_id| {
                    ast::PrincipalConstraint::is_entity_type_in(
                        Arc::clone(C::entity_type()),
                        Arc::new(team_id.to_euid()),
                    )
                },
            ),
            Self::InTeamRole { team_role_id } => team_role_id.map_or_else(
                || ast::PrincipalConstraint::is_entity_type_in_slot(Arc::clone(C::entity_type())),
                |team_role_id| {
                    ast::PrincipalConstraint::is_entity_type_in(
                        Arc::clone(C::entity_type()),
                        Arc::new(team_role_id.to_euid()),
                    )
                },
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use hash_graph_types::owned_by_id::OwnedById;
    use serde_json::json;
    use uuid::Uuid;

    use super::{WebPrincipalConstraint, WebRoleId, WebTeamId, WebTeamRoleId};
    use crate::{
        policies::{PrincipalConstraint, principal::tests::check_principal},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn in_web() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_principal(
            &PrincipalConstraint::Web(WebPrincipalConstraint::InWeb { id: Some(web_id) }),
            json!({
                "type": "web",
                "id": web_id,
            }),
            format!(r#"principal in HASH::Web::"{web_id}""#),
        )?;

        check_principal(
            &PrincipalConstraint::Web(WebPrincipalConstraint::InWeb { id: None }),
            json!({
                "type": "web",
                "id": null,
            }),
            "principal in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "web",
            }),
            "data did not match any variant of untagged enum WebPrincipalConstraint",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "web",
                "id": web_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum WebPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn in_role() -> Result<(), Box<dyn Error>> {
        let role_id = WebRoleId::new(Uuid::new_v4());
        check_principal(
            &PrincipalConstraint::Web(WebPrincipalConstraint::InRole {
                role_id: Some(role_id),
            }),
            json!({
                "type": "web",
                "roleId": role_id,
            }),
            format!(r#"principal in HASH::Web::Role::"{role_id}""#),
        )?;

        check_principal(
            &PrincipalConstraint::Web(WebPrincipalConstraint::InRole { role_id: None }),
            json!({
                "type": "web",
                "roleId": null,
            }),
            "principal in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "web",
                "id": Uuid::new_v4(),
                "roleId": role_id,
            }),
            "data did not match any variant of untagged enum WebPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn in_team() -> Result<(), Box<dyn Error>> {
        let team_id = WebTeamId::new(Uuid::new_v4());
        check_principal(
            &PrincipalConstraint::Web(WebPrincipalConstraint::InTeam {
                team_id: Some(team_id),
            }),
            json!({
                "type": "web",
                "teamId": team_id,
            }),
            format!(r#"principal in HASH::Web::Team::"{team_id}""#),
        )?;

        check_principal(
            &PrincipalConstraint::Web(WebPrincipalConstraint::InTeam { team_id: None }),
            json!({
                "type": "web",
                "teamId": null,
            }),
            "principal in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "web",
            }),
            "data did not match any variant of untagged enum WebPrincipalConstraint",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "web",
                "teamId": team_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum WebPrincipalConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn in_team_role() -> Result<(), Box<dyn Error>> {
        let role_id = WebTeamRoleId::new(Uuid::new_v4());
        check_principal(
            &PrincipalConstraint::Web(WebPrincipalConstraint::InTeamRole {
                team_role_id: Some(role_id),
            }),
            json!({
                "type": "web",
                "teamRoleId": role_id,
            }),
            format!(r#"principal in HASH::Web::Team::Role::"{role_id}""#),
        )?;

        check_principal(
            &PrincipalConstraint::Web(WebPrincipalConstraint::InTeamRole { team_role_id: None }),
            json!({
                "type": "web",
                "teamRoleId": null,
            }),
            "principal in ?principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "web",
                "teamRoleId": role_id,
                "teamId": Uuid::new_v4(),
            }),
            "data did not match any variant of untagged enum WebPrincipalConstraint",
        )?;

        Ok(())
    }
}
