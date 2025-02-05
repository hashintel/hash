use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum OrganizationRoleConstraint {
    Any {
        #[serde(deserialize_with = "Option::deserialize")]
        organization_id: Option<Uuid>,
    },
    Exact {
        #[serde(deserialize_with = "Option::deserialize")]
        role_id: Option<Uuid>,
    },
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use uuid::Uuid;

    use super::OrganizationRoleConstraint;
    use crate::{
        policies::{PrincipalConstraint, principal::tests::check_principal},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() {
        let organization_id = Uuid::new_v4();
        check_principal(
            PrincipalConstraint::Organization(OrganizationRoleConstraint::Any {
                organization_id: Some(organization_id),
            }),
            json!({
                "type": "organization",
                "organizationId": organization_id,
            }),
            format!(r#"principal in HASH::Organization::"{organization_id}""#),
        );

        check_principal(
            PrincipalConstraint::Organization(OrganizationRoleConstraint::Any {
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
            "data did not match any variant of untagged enum OrganizationRoleConstraint",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "organization",
                "organizationId": organization_id,
                "additional": "unexpected",
            }),
            "data did not match any variant of untagged enum OrganizationRoleConstraint",
        );
    }

    #[test]
    fn constraint_exact() {
        let role_id = Uuid::new_v4();
        check_principal(
            PrincipalConstraint::Organization(OrganizationRoleConstraint::Exact {
                role_id: Some(role_id),
            }),
            json!({
                "type": "organization",
                "roleId": role_id,
            }),
            format!(r#"principal in HASH::Organization::Role::"{role_id}""#),
        );

        check_principal(
            PrincipalConstraint::Organization(OrganizationRoleConstraint::Exact { role_id: None }),
            json!({
                "type": "organization",
                "roleId": null,
            }),
            "principal in ?principal",
        );

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "organization",
                "roleId": role_id,
                "organizationId": Uuid::new_v4(),
            }),
            "data did not match any variant of untagged enum OrganizationRoleConstraint",
        );
    }
}
