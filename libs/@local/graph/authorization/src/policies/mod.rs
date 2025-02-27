pub mod action;
pub mod error;
pub mod principal;
pub mod resource;

mod cedar;
mod context;
mod set;
mod validation;

use alloc::{collections::BTreeMap, sync::Arc};
use core::{fmt, str::FromStr as _};

use cedar::CedarEntityId as _;
use cedar_policy_core::{ast, extensions::Extensions, parser::parse_policy};
use error_stack::{Report, ResultExt as _};
use uuid::Uuid;

pub(crate) use self::cedar::cedar_resource_type;
use self::{
    action::{ActionConstraint, ActionId},
    principal::{ActorId, PrincipalConstraint},
    resource::{ResourceConstraint, ResourceId},
};
pub use self::{
    context::{Context, ContextBuilder, ContextError},
    validation::{PolicyValidationError, Validator},
};

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

#[non_exhaustive]
#[derive(Debug)]
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

#[derive(Debug)]
pub struct Request<'a> {
    actor: ActorId,
    action: ActionId,
    resource: &'a ResourceId<'a>,
    context: RequestContext,
}

impl Request<'_> {
    pub(crate) fn to_cedar(&self) -> ast::Request {
        ast::Request::new(
            (self.actor.to_euid(), None),
            (self.action.to_euid(), None),
            (self.resource.to_euid(), None),
            self.context.to_cedar(),
            Some(Validator::schema()),
            Extensions::none(),
        )
        .expect("Request should be a valid Cedar request")
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
    pub(crate) fn try_from_cedar(
        policy: &ast::StaticPolicy,
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

    pub(crate) fn to_cedar_template(&self) -> ast::Template {
        let (resource_constraint, resource_expr) = self.resource.to_cedar();
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
            resource_constraint,
            resource_expr,
        )
    }

    pub(crate) fn to_cedar_static_policy(
        &self,
    ) -> Result<ast::StaticPolicy, Report<ast::UnexpectedSlotError>> {
        Ok(self.to_cedar_template().try_into()?)
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
        Self::try_from_cedar(
            &parse_policy(
                Some(ast::PolicyID::from_string(
                    policy_id
                        .unwrap_or_else(|| PolicyId::new(Uuid::new_v4()))
                        .to_string(),
                )),
                text,
            )
            .change_context(InvalidPolicy::InvalidSyntax)?,
        )
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
    use crate::{
        policies::{Validator, set::PolicySet},
        test_utils::check_serialization,
    };

    #[track_caller]
    pub(crate) fn check_policy(
        policy: &Policy,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        check_serialization(policy, value);

        let cedar_policy = policy.to_cedar_template();

        assert_eq!(cedar_policy.to_string(), cedar_string.as_ref());

        let mut policy_set = PolicySet::default();
        if policy.principal.has_slot() || policy.resource.has_slot() {
            policy_set.add_template(policy)?;
        } else {
            let static_policy = policy.to_cedar_static_policy()?;
            policy_set.add_policy(&Policy::try_from_cedar(&static_policy)?)?;
        }

        Validator.validate_policy_set(&policy_set)?;

        Ok(())
    }

    mod serialization {
        use alloc::borrow::Cow;
        use core::{error::Error, str::FromStr as _};

        use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
        use type_system::url::VersionedUrl;

        use super::*;
        use crate::policies::{
            ActionConstraint, ActionId, ContextBuilder, Effect, PolicyId, PrincipalConstraint,
            Request, RequestContext, ResourceConstraint,
            principal::{
                Actor,
                user::{User, UserId, UserPrincipalConstraint},
            },
            resource::{EntityResource, EntityResourceConstraint, Resource},
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
                    id: Some(entity_uuid),
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
                        "id": entity_uuid,
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

            let actor = Actor::User(User {
                id: user_id,
                roles: Vec::new(),
            });
            let actor_id = actor.id();

            let entity = Resource::Entity(EntityResource {
                web_id: OwnedById::new(Uuid::new_v4()),
                id: entity_uuid,
                entity_type: Cow::Owned(vec![
                    VersionedUrl::from_str("https://hash.ai/@hash/types/entity-type/user/v/1")
                        .expect("Invalid entity type URL"),
                ]),
            });
            let resource_id = entity.id();

            let context = ContextBuilder::default()
                .with_actor(&actor)
                .with_resource(&entity)
                .build()?;

            let mut policy_set = PolicySet::default();
            policy_set.add_policy(&policy)?;

            assert!(policy_set.evaluate(
                &Request {
                    actor: actor_id,
                    action: ActionId::View,
                    resource: &resource_id,
                    context: RequestContext,
                },
                &context
            )?);

            assert!(!policy_set.evaluate(
                &Request {
                    actor: actor_id,
                    action: ActionId::Update,
                    resource: &resource_id,
                    context: RequestContext,
                },
                &context
            )?);

            Ok(())
        }
    }
}
