pub mod action;
pub mod error;
pub mod principal;
pub mod resource;
pub mod store;

pub(crate) mod cedar;
mod components;
mod context;
mod set;
mod validation;

use alloc::{borrow::Cow, collections::BTreeMap, sync::Arc};
use core::fmt;

use cedar_policy_core::{ast, extensions::Extensions, parser::parse_policy};
use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use type_system::{
    knowledge::entity::id::EntityUuid,
    principal::{actor::ActorId, actor_group::WebId},
};
use uuid::Uuid;

pub(crate) use self::cedar::cedar_resource_type;
use self::{
    action::ActionName,
    cedar::{FromCedarEntityUId as _, ToCedarEntityId},
    principal::{PrincipalConstraint, actor::PublicActor},
    resource::{EntityTypeId, ResourceConstraint},
};
pub use self::{
    cedar::PolicyExpressionTree,
    components::{OptimizationData, PolicyComponents, PolicyComponentsBuilder},
    context::{Context, ContextBuilder, ContextError},
    set::{
        Authorized, PolicyConstraintError, PolicyEvaluationError, PolicySet,
        PolicySetInsertionError,
    },
    validation::{PolicyValidationError, PolicyValidator},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::FromSql, postgres_types::ToSql),
    postgres(name = "policy_effect", rename_all = "snake_case")
)]
#[serde(rename_all = "camelCase")]
pub enum Effect {
    Permit,
    Forbid,
}

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::FromSql, postgres_types::ToSql),
    postgres(transparent)
)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
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

#[derive(PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Policy {
    pub id: PolicyId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub effect: Effect,
    pub principal: Option<PrincipalConstraint>,
    pub actions: Vec<ActionName>,
    pub resource: Option<ResourceConstraint>,
    #[serde(skip)]
    pub constraints: Option<()>,
}

impl fmt::Debug for Policy {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", self.to_cedar_template())
    }
}

#[non_exhaustive]
#[derive(Debug, Default)]
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResourceId<'a> {
    Web(WebId),
    Entity(EntityUuid),
    EntityType(Cow<'a, EntityTypeId>),
}

impl ToCedarEntityId for ResourceId<'_> {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        match self {
            Self::Web(web_id) => web_id.to_cedar_entity_type(),
            Self::Entity(entity) => entity.to_cedar_entity_type(),
            Self::EntityType(entity_type) => entity_type.to_cedar_entity_type(),
        }
    }

    fn to_eid(&self) -> ast::Eid {
        match self {
            Self::Web(web_id) => web_id.to_eid(),
            Self::Entity(entity_uuid) => entity_uuid.to_eid(),
            Self::EntityType(entity_type) => entity_type.to_eid(),
        }
    }
}

#[derive(Debug)]
pub struct Request<'a> {
    pub actor: Option<ActorId>,
    pub action: ActionName,
    pub resource: &'a ResourceId<'a>,
    pub context: RequestContext,
}

impl Request<'_> {
    pub(crate) fn to_cedar(&self) -> ast::Request {
        ast::Request::new_with_unknowns(
            ast::EntityUIDEntry::known(
                self.actor
                    .as_ref()
                    .map_or_else(|| PublicActor.to_euid(), ActorId::to_euid),
                None,
            ),
            ast::EntityUIDEntry::known(self.action.to_euid(), None),
            ast::EntityUIDEntry::known(self.resource.to_euid(), None),
            Some(self.context.to_cedar()),
            Some(PolicyValidator::schema()),
            Extensions::none(),
        )
        .expect("Request should be a valid Cedar request")
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum InvalidPolicy {
    #[display("Invalid policy ID")]
    PolicyId,
    #[display("Invalid principal constraint")]
    PrincipalConstraint,
    #[display("Invalid action constraint")]
    ActionConstraint,
    #[display("Invalid resource constraint")]
    ResourceConstraint,
    #[display("Invalid policy syntax")]
    Syntax,
}

impl Policy {
    pub(crate) fn try_from_cedar(
        policy: &ast::StaticPolicy,
    ) -> Result<Self, Report<InvalidPolicy>> {
        Ok(Self {
            id: PolicyId::new(
                policy
                    .id()
                    .as_ref()
                    .parse()
                    .change_context(InvalidPolicy::PolicyId)?,
            ),
            name: None,
            effect: match policy.effect() {
                ast::Effect::Permit => Effect::Permit,
                ast::Effect::Forbid => Effect::Forbid,
            },
            principal: PrincipalConstraint::try_from_cedar(policy.principal_constraint())
                .change_context(InvalidPolicy::PrincipalConstraint)?,
            actions: match policy.action_constraint() {
                ast::ActionConstraint::Any => vec![ActionName::All],
                ast::ActionConstraint::Eq(action) => vec![
                    ActionName::from_euid(action)
                        .change_context(InvalidPolicy::ActionConstraint)?,
                ],
                ast::ActionConstraint::In(actions) => actions
                    .iter()
                    .map(|action| ActionName::from_euid(action))
                    .try_collect_reports()
                    .change_context(InvalidPolicy::ActionConstraint)?,
            },
            resource: ResourceConstraint::try_from_cedar(
                policy.resource_constraint(),
                policy.non_scope_constraints(),
            )
            .change_context(InvalidPolicy::ResourceConstraint)?,
            constraints: None,
        })
    }

    pub(crate) fn to_cedar_template(&self) -> ast::Template {
        let (resource_constraint, resource_expr) = self.resource.as_ref().map_or_else(
            || (ast::ResourceConstraint::any(), ast::Expr::val(true)),
            ResourceConstraint::to_cedar,
        );
        ast::Template::new(
            ast::PolicyID::from_string(self.id.to_string()),
            None,
            ast::Annotations::new(),
            match self.effect {
                Effect::Permit => ast::Effect::Permit,
                Effect::Forbid => ast::Effect::Forbid,
            },
            self.principal
                .as_ref()
                .map_or_else(ast::PrincipalConstraint::any, PrincipalConstraint::to_cedar),
            if self.actions.contains(&ActionName::All) {
                ast::ActionConstraint::Any
            } else {
                ast::ActionConstraint::In(
                    self.actions
                        .iter()
                        .map(|action| Arc::new(ActionName::to_euid(action)))
                        .collect(),
                )
            },
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
            .change_context(InvalidPolicy::Syntax)
            .attach_printable_lazy(|| text.to_owned())?,
        )
    }

    /// Parses multiple policies from a string.
    ///
    /// # Errors
    ///
    /// - [`InvalidPolicy::InvalidSyntax`] if the Cedar policy is invalid.
    /// - [`InvalidPolicy`] if the Cedar policy cannot be converted to a [`Policy`].
    pub fn parse_cedar_policies(text: &str) -> Result<Vec<Self>, Report<InvalidPolicy>> {
        text.split_inclusive(';')
            .filter(|policy| !policy.trim().is_empty())
            .map(|policy| Self::parse_cedar_policy(policy, None))
            .collect()
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
        policies::{PolicyValidator, set::PolicySet},
        test_utils::check_serialization,
    };

    #[track_caller]
    pub(crate) fn check_policy(
        policy: &Policy,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        check_serialization(policy, value);

        assert_eq!(format!("{policy:?}"), cedar_string.as_ref());

        let mut policy_set = PolicySet::default();
        let static_policy = policy.to_cedar_static_policy()?;
        policy_set.add_policy(&Policy::try_from_cedar(&static_policy)?)?;

        PolicyValidator.validate_policy_set(&policy_set)?;

        Ok(())
    }

    mod serialization {
        use alloc::borrow::Cow;
        use core::{error::Error, str::FromStr as _};
        use std::collections::HashSet;

        use type_system::{
            knowledge::entity::{EntityId, id::EntityUuid},
            ontology::VersionedUrl,
            principal::{
                actor::{ActorId, User, UserId},
                actor_group::WebId,
            },
        };

        use super::*;
        use crate::policies::{
            ActionName, Authorized, ContextBuilder, Effect, PolicyId, PrincipalConstraint, Request,
            RequestContext, ResourceConstraint, ResourceId,
            resource::{EntityResource, EntityResourceConstraint},
        };

        #[test]
        fn user_can_view_entity_uuid() -> Result<(), Box<dyn Error>> {
            let user_id = UserId::new(Uuid::new_v4());
            let entity_uuid = EntityUuid::new(Uuid::new_v4());

            let policy = Policy {
                id: PolicyId::new(Uuid::new_v4()),
                name: None,
                effect: Effect::Permit,
                principal: Some(PrincipalConstraint::Actor {
                    actor: ActorId::User(user_id),
                }),
                actions: vec![ActionName::View],
                resource: Some(ResourceConstraint::Entity(
                    EntityResourceConstraint::Exact { id: entity_uuid },
                )),
                constraints: None,
            };

            check_policy(
                &policy,
                json!({
                    "id": policy.id,
                    "effect": "permit",
                    "principal": {
                        "type": "actor",
                        "actorType": "user",
                        "id": user_id,
                    },
                    "actions": ["view"],
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

            let user = User {
                id: user_id,
                roles: HashSet::new(),
            };
            let user_entity = EntityResource {
                id: EntityId {
                    web_id: WebId::from(user_id),
                    entity_uuid,
                    draft_id: None,
                },
                entity_type: Cow::Owned(vec![
                    VersionedUrl::from_str("https://hash.ai/@hash/types/entity-type/user/v/6")?,
                    VersionedUrl::from_str("https://hash.ai/@hash/types/entity-type/actor/v/2")?,
                ]),
                created_by: user.id.into(),
            };
            let resource_id = ResourceId::Entity(user_entity.id.entity_uuid);
            let mut context = ContextBuilder::default();
            context.add_entity(&user_entity);
            let context = context.build()?;

            let actor_id = ActorId::User(user.id);

            let policy_set = PolicySet::default()
                .with_tracked_actions(HashSet::from([ActionName::View, ActionName::Update]))
                .with_policy(&policy)?;

            assert!(matches!(
                policy_set.evaluate(
                    &Request {
                        actor: Some(actor_id),
                        action: ActionName::View,
                        resource: &resource_id,
                        context: RequestContext,
                    },
                    &context
                )?,
                Authorized::Always
            ));

            assert!(matches!(
                policy_set.evaluate(
                    &Request {
                        actor: Some(actor_id),
                        action: ActionName::Update,
                        resource: &resource_id,
                        context: RequestContext,
                    },
                    &context
                )?,
                Authorized::Never
            ));

            Ok(())
        }
    }
}
