pub mod error;

pub(crate) use self::cedar::cedar_resource_type;
pub use self::{
    action::{ActionConstraint, ActionId},
    principal::{
        OrganizationId, OrganizationPrincipalConstraint, OrganizationRoleId, PrincipalConstraint,
        UserId, UserPrincipalConstraint,
    },
    resource::{EntityResourceConstraint, ResourceConstraint},
};
mod action;
mod cedar;
mod principal;
mod resource;

use core::fmt;

use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Effect {
    Permit,
    Forbid,
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
pub struct PolicyId(Uuid);

impl PolicyId {
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

impl fmt::Display for PolicyId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Policy {
    pub id: PolicyId,
    pub effect: Effect,
    pub principal: PrincipalConstraint,
    pub action: ActionConstraint,
    pub resource: ResourceConstraint,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraints: Option<()>,
}

#[cfg(test)]
mod tests {
    use cedar_policy_core::ast;
    use indoc::formatdoc;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use super::Policy;
    use crate::test_utils::check_serialization;

    #[track_caller]
    pub(crate) fn check_policy(policy: Policy, value: JsonValue, cedar_string: impl AsRef<str>) {
        check_serialization(&policy, value);

        let cedar_policy = ast::Template::from(&policy);
        assert_eq!(cedar_policy.to_string(), cedar_string.as_ref());
        if !policy.principal.has_slot() && !policy.resource.has_slot() {
            Policy::try_from(cedar_policy).expect("should be able to convert Cedar policy back");
        }
    }

    mod serialization {
        use hash_graph_types::knowledge::entity::EntityUuid;

        use super::*;
        use crate::policies::{
            ActionConstraint, ActionId, Effect, EntityResourceConstraint, PolicyId,
            PrincipalConstraint, ResourceConstraint, UserId, UserPrincipalConstraint,
        };

        #[test]
        fn user_can_view_entity_uuid() {
            let policy_id = PolicyId::new(Uuid::new_v4());
            let user_id = UserId::new(Uuid::new_v4());
            let entity_uuid = EntityUuid::new(Uuid::new_v4());

            check_policy(
                Policy {
                    id: policy_id,
                    effect: Effect::Permit,
                    principal: PrincipalConstraint::User(UserPrincipalConstraint::Exact {
                        user_id: Some(user_id),
                    }),
                    action: ActionConstraint::Many {
                        actions: vec![ActionId::View],
                    },
                    resource: ResourceConstraint::Entity(EntityResourceConstraint::Exact {
                        entity_uuid: Some(entity_uuid),
                    }),
                    constraints: None,
                },
                json!({
                    "id": policy_id,
                    "effect": "permit",
                    "principal": {
                        "type": "user",
                        "userId": user_id,
                    },
                    "action": {
                        "type": "many",
                        "actions": ["view"],
                    },
                    "resource": {
                        "type": "entity",
                        "entityUuid": entity_uuid,
                    },
                }),
                formatdoc!(
                    r#"
                    permit(
                      principal == HASH::User::"{user_id}",
                      action in [HASH::Action::"view"],
                      resource == HASH::Entity::"{entity_uuid}"
                    ) when {{
                      true
                    }};"#
                ),
            );
        }
    }
}
