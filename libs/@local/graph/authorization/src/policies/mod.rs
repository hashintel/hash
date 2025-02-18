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

use alloc::{collections::BTreeMap, sync::Arc};
use core::{error::Error, fmt, str::FromStr as _};
use std::collections::HashMap;

use cedar::CedarEntityId as _;
use cedar_policy_core::{
    ast, entities::Entities, evaluator::Evaluator, extensions::Extensions,
    parser::parse_policy_or_template_to_est_and_ast,
};
use error_stack::{Report, ResultExt as _};
use hash_graph_types::knowledge::entity::EntityUuid;
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

pub struct User {
    pub id: UserId,
}

#[non_exhaustive]
pub struct RequestContext;

impl RequestContext {
    #[expect(
        clippy::unused_self,
        reason = "More fields will be added to the context"
    )]
    pub(crate) fn to_cedar(&self) -> ast::Context {
        ast::Context::Value(Arc::new(BTreeMap::new()))
    }
}

pub struct Request {
    user: User,
    action: ActionId,
    resource: EntityUuid,
    context: RequestContext,
}

impl Request {
    pub(crate) fn to_cedar(&self) -> Result<ast::Request, Box<dyn Error>> {
        Ok(ast::Request::new(
            (self.user.id.to_euid(), None),
            (self.action.to_euid(), None),
            (self.resource.to_euid(), None),
            self.context.to_cedar(),
            None::<&ast::RequestSchemaAllPass>,
            Extensions::none(),
        )?)
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum InvalidPolicy {
    #[display("Invalid policy id")]
    InvalidId,
    #[display("Invalid principal constraint")]
    InvalidPrincipalConstraint,
    #[display("Invalid action constraint")]
    InvalidActionConstraint,
    #[display("Invalid resource constraint")]
    InvalidResourceConstraint,
    #[display("Invalid policy syntax")]
    InvalidSyntax,
}

impl Policy {
    pub(crate) fn try_from_cedar_template(
        policy: &ast::Template,
    ) -> Result<Self, Report<InvalidPolicy>> {
        Ok(Self {
            id: PolicyId::new(
                Uuid::from_str(policy.id().as_ref()).change_context(InvalidPolicy::InvalidId)?,
            ),
            effect: match policy.effect() {
                ast::Effect::Permit => Effect::Permit,
                ast::Effect::Forbid => Effect::Forbid,
            },
            principal: PrincipalConstraint::try_from_cedar(policy.principal_constraint())
                .change_context(InvalidPolicy::InvalidPrincipalConstraint)?,
            action: ActionConstraint::try_from_cedar(policy.action_constraint())
                .change_context(InvalidPolicy::InvalidActionConstraint)?,
            resource: ResourceConstraint::try_from_cedar(policy.resource_constraint())
                .change_context(InvalidPolicy::InvalidResourceConstraint)?,
            constraints: None,
        })
    }

    pub(crate) fn to_cedar(&self) -> ast::Template {
        ast::Template::new(
            ast::PolicyID::from_string(self.id.to_string()),
            None,
            ast::Annotations::new(),
            match self.effect {
                Effect::Permit => ast::Effect::Permit,
                Effect::Forbid => ast::Effect::Forbid,
            },
            self.principal.to_cedar(),
            self.action.to_cedar(),
            self.resource.to_cedar(),
            ast::Expr::val(true),
        )
    }

    /// Parses a policy from a string.
    ///
    /// If `policy_id` is not provided, a new [`PolicyId`] will be generated.
    ///
    /// # Errors
    ///
    /// - [`InvalidPolicy::InvalidSyntax`] if the Cedar policy is invalid.
    /// - [`InvalidPolicy`] if the Cedar policy cannot be converted to a [`Policy`].
    pub fn parse_cedar_policy(
        text: &str,
        policy_id: Option<PolicyId>,
    ) -> Result<Self, Report<InvalidPolicy>> {
        let (_, template) = parse_policy_or_template_to_est_and_ast(
            Some(ast::PolicyID::from_string(
                policy_id
                    .unwrap_or_else(|| PolicyId::new(Uuid::new_v4()))
                    .to_string(),
            )),
            text,
        )
        .change_context(InvalidPolicy::InvalidSyntax)?;
        Self::try_from_cedar_template(&template)
    }

    /// Evaluates the policy for the given request.
    ///
    /// # Errors
    ///
    /// - [`Error`] if the policy is invalid.
    // TODO: Use `Report` instead of `Box<dyn Error>`
    pub fn evaluate(&self, request: &Request) -> Result<bool, Box<dyn Error>> {
        let cedar_policy = Arc::new(self.to_cedar());
        let policy_id = cedar_policy.id().clone();
        let policy = ast::Template::link(cedar_policy, policy_id, HashMap::new())?;
        let entities = Entities::new();
        let evaluator = Evaluator::new(request.to_cedar()?, &entities, Extensions::none());
        Ok(evaluator.evaluate(&policy)?)
    }
}

#[cfg(test)]
#[expect(clippy::panic_in_result_fn, reason = "Assertions in test are expected")]
mod tests {
    use core::error::Error;

    use indoc::formatdoc;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use super::Policy;
    use crate::test_utils::check_serialization;

    #[track_caller]
    pub(crate) fn check_policy(
        policy: &Policy,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        check_serialization(policy, value);

        let cedar_policy = policy.to_cedar();
        assert_eq!(cedar_policy.to_string(), cedar_string.as_ref());
        if !policy.principal.has_slot() && !policy.resource.has_slot() {
            Policy::try_from_cedar_template(&cedar_policy)?;
        }
        Ok(())
    }

    mod serialization {
        use core::error::Error;

        use hash_graph_types::knowledge::entity::EntityUuid;

        use super::*;
        use crate::policies::{
            ActionConstraint, ActionId, Effect, EntityResourceConstraint, PolicyId,
            PrincipalConstraint, Request, RequestContext, ResourceConstraint, User, UserId,
            UserPrincipalConstraint,
        };

        #[test]
        fn user_can_view_entity_uuid() -> Result<(), Box<dyn Error>> {
            let policy_id = PolicyId::new(Uuid::new_v4());
            let user_id = UserId::new(Uuid::new_v4());
            let entity_uuid = EntityUuid::new(Uuid::new_v4());

            let policy = Policy {
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
            };

            check_policy(
                &policy,
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
            )?;

            assert!(policy.evaluate(&Request {
                user: User { id: user_id },
                action: ActionId::View,
                resource: entity_uuid,
                context: RequestContext,
            })?);

            assert!(!policy.evaluate(&Request {
                user: User { id: user_id },
                action: ActionId::ViewMetadata,
                resource: entity_uuid,
                context: RequestContext,
            })?);

            Ok(())
        }
    }
}
