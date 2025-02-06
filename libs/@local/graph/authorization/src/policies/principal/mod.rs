#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

pub use self::{
    organization::{OrganizationId, OrganizationPrincipalConstraint, OrganizationRoleId},
    user::{UserId, UserPrincipalConstraint},
};

mod organization;
mod user;

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PrincipalConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
    Public {},
    User(UserPrincipalConstraint),
    Organization(OrganizationPrincipalConstraint),
}

impl PrincipalConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Public {} => false,
            Self::User(user) => user.has_slot(),
            Self::Organization(organization) => organization.has_slot(),
        }
    }
}

#[cfg(test)]
mod tests {
    use cedar_policy_core::ast;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};

    use super::PrincipalConstraint;
    use crate::test_utils::{check_deserialization_error, check_serialization};

    #[track_caller]
    pub(crate) fn check_principal(
        constraint: PrincipalConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) {
        check_serialization(&constraint, value);

        let cedar_policy = ast::PrincipalConstraint::from(&constraint);
        assert_eq!(cedar_policy.to_string(), cedar_string.as_ref());
        if !constraint.has_slot() {
            PrincipalConstraint::try_from(cedar_policy)
                .expect("should be able to convert Cedar policy back");
        }
    }

    #[test]
    fn constraint_public() {
        check_principal(
            PrincipalConstraint::Public {},
            json!({
                "type": "public",
            }),
            "principal",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "public",
                "additional": "unexpected"
            }),
            "unknown field `additional`, there are no fields",
        );
    }
}
