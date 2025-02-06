#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

use alloc::sync::Arc;
use core::{error::Error, fmt, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::Report;
use uuid::Uuid;

use crate::policies::{
    cedar::CedarEntityId, principal::organization::OrganizationPrincipalConstraint,
};

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
pub struct UserId(Uuid);

impl UserId {
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

impl fmt::Display for UserId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CedarEntityId for UserId {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["User"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.0.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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
    Organization(OrganizationPrincipalConstraint),
}

impl UserPrincipalConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Any {} | Self::Exact { user_id: Some(_) } => false,
            Self::Exact { user_id: None } => true,
            Self::Organization(organization) => organization.has_slot(),
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
            OrganizationId, OrganizationRoleId, PrincipalConstraint, UserId,
            principal::{UserPrincipalConstraint, tests::check_principal},
        },
        test_utils::check_deserialization_error,
    };

    #[test]
    fn any() {
        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Any {}),
            json!({
                "type": "user",
            }),
            "principal is HASH::User",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum UserPrincipalConstraint",
        );
    }

    #[test]
    fn exact() {
        let user_id = UserId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Exact {
                user_id: Some(user_id),
            }),
            json!({
                "type": "user",
                "userId": user_id,
            }),
            format!(r#"principal == HASH::User::"{user_id}""#),
        );

        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Exact { user_id: None }),
            json!({
                "type": "user",
                "userId": null,
            }),
            "principal == ?principal",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "userId": user_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum UserPrincipalConstraint",
        );
    }

    #[test]
    fn organization() {
        let organization_id = OrganizationId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Organization(
                OrganizationPrincipalConstraint::InOrganization {
                    organization_id: Some(organization_id),
                },
            )),
            json!({
                "type": "user",
                "organizationId": organization_id,
            }),
            format!(r#"principal is HASH::User in HASH::Organization::"{organization_id}""#),
        );

        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Organization(
                OrganizationPrincipalConstraint::InOrganization {
                    organization_id: None,
                },
            )),
            json!({
                "type": "user",
                "organizationId": null,
            }),
            "principal is HASH::User in ?principal",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "organizationId": organization_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum UserPrincipalConstraint",
        );
    }

    #[test]
    fn organization_role() {
        let organization_role_id = OrganizationRoleId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Organization(
                OrganizationPrincipalConstraint::InRole {
                    organization_role_id: Some(organization_role_id),
                },
            )),
            json!({
                "type": "user",
                "organizationRoleId": organization_role_id,
            }),
            format!(
                r#"principal is HASH::User in HASH::Organization::Role::"{organization_role_id}""#
            ),
        );

        check_principal(
            PrincipalConstraint::User(UserPrincipalConstraint::Organization(
                OrganizationPrincipalConstraint::InRole {
                    organization_role_id: None,
                },
            )),
            json!({
                "type": "user",
                "organizationRoleId": null,
            }),
            "principal is HASH::User in ?principal",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "organizationRoleId": organization_role_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum UserPrincipalConstraint",
        );
    }
}
