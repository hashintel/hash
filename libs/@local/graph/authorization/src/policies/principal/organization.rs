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
pub struct OrganizationId(Uuid);

impl OrganizationId {
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

impl fmt::Display for OrganizationId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CedarEntityId for OrganizationId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Organization"]));
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
pub struct OrganizationRoleId(Uuid);

impl OrganizationRoleId {
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

impl fmt::Display for OrganizationRoleId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CedarEntityId for OrganizationRoleId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Organization", "Role"]));
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
pub enum OrganizationPrincipalConstraint {
    InOrganization {
        #[serde(deserialize_with = "Option::deserialize")]
        organization_id: Option<OrganizationId>,
    },
    InRole {
        #[serde(deserialize_with = "Option::deserialize")]
        organization_role_id: Option<OrganizationRoleId>,
    },
}

impl OrganizationPrincipalConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::InOrganization {
                organization_id: Some(_),
            }
            | Self::InRole {
                organization_role_id: Some(_),
            } => false,
            Self::InOrganization {
                organization_id: None,
            }
            | Self::InRole {
                organization_role_id: None,
            } => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use uuid::Uuid;

    use super::OrganizationPrincipalConstraint;
    use crate::{
        policies::{
            OrganizationId, OrganizationRoleId, PrincipalConstraint,
            principal::tests::check_principal,
        },
        test_utils::check_deserialization_error,
    };

    #[test]
    fn in_organization() {
        let organization_id = OrganizationId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Organization(OrganizationPrincipalConstraint::InOrganization {
                organization_id: Some(organization_id),
            }),
            json!({
                "type": "organization",
                "organizationId": organization_id,
            }),
            format!(r#"principal in HASH::Organization::"{organization_id}""#),
        );

        check_principal(
            PrincipalConstraint::Organization(OrganizationPrincipalConstraint::InOrganization {
                organization_id: None,
            }),
            json!({
                "type": "organization",
                "organizationId": null,
            }),
            "principal in ?principal",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "organization",
            }),
            "data did not match any variant of untagged enum OrganizationPrincipalConstraint",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "organization",
                "organizationId": organization_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum OrganizationPrincipalConstraint",
        );
    }

    #[test]
    fn in_role() {
        let role_id = OrganizationRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::Organization(OrganizationPrincipalConstraint::InRole {
                organization_role_id: Some(role_id),
            }),
            json!({
                "type": "organization",
                "organizationRoleId": role_id,
            }),
            format!(r#"principal in HASH::Organization::Role::"{role_id}""#),
        );

        check_principal(
            PrincipalConstraint::Organization(OrganizationPrincipalConstraint::InRole {
                organization_role_id: None,
            }),
            json!({
                "type": "organization",
                "organizationRoleId": null,
            }),
            "principal in ?principal",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "organization",
                "roleId": role_id,
                "organizationRoleId": Uuid::new_v4(),
            }),
            "data did not match any variant of untagged enum OrganizationPrincipalConstraint",
        );
    }
}
