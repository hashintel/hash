pub use self::organization::OrganizationRoleConstraint;

mod organization;

use hash_graph_types::account::AccountId;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PrincipalConstraint {
    Public {},
    User {
        #[serde(deserialize_with = "Option::deserialize")]
        user_id: Option<AccountId>,
    },
    Organization(OrganizationRoleConstraint),
}

#[cfg(test)]
mod tests {
    use hash_graph_types::account::AccountId;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use super::PrincipalConstraint;
    use crate::test_utils::{check_deserialization_error, check_serialization};

    #[track_caller]
    pub(crate) fn check_principal(
        constraint: PrincipalConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) {
        check_serialization(&constraint, value);

        #[cfg(feature = "cedar")]
        assert_eq!(
            cedar_policy_core::ast::PrincipalConstraint::from(constraint).to_string(),
            cedar_string.as_ref(),
        );
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

    #[test]
    fn constraint_user() {
        let user_id = AccountId::new(Uuid::new_v4());
        check_principal(
            PrincipalConstraint::User {
                user_id: Some(user_id),
            },
            json!({
                "type": "user",
                "userId": user_id,
            }),
            format!(r#"principal == HASH::User::"{user_id}""#),
        );

        check_principal(
            PrincipalConstraint::User { user_id: None },
            json!({
                "type": "user",
                "userId": null,
            }),
            "principal == ?principal",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
            }),
            "missing field `userId`",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "user",
                "userId": user_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `userId`",
        );
    }
}
