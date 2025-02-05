use core::iter;
use std::sync::{Arc, LazyLock};

use cedar_policy_core::ast;
use hash_graph_types::{account::AccountId, knowledge::entity::EntityUuid, owned_by_id::OwnedById};
use uuid::Uuid;

use crate::policies::{
    Action, ActionGroup, ActionGroupName, Effect, EntityResourceConstraint,
    OrganizationRoleConstraint, Policy, PrincipalConstraint, ResourceConstraint,
    action::ActionConstraint,
};

fn resource_type<const N: usize>(names: [&'static str; N]) -> Arc<ast::EntityType> {
    let [namespaces @ .., name] = names.as_slice() else {
        panic!("names should not be empty")
    };

    Arc::new(ast::EntityType::from(
        ast::Name::try_from(ast::InternalName::new(
            name.parse().expect("name should be valid"),
            iter::once(&"HASH")
                .chain(namespaces)
                .map(|namespace| namespace.parse().expect("namespace should be valid")),
            None,
        ))
        .expect("name should be valid"),
    ))
}

static USER_PRINCIPAL_TYPE: LazyLock<Arc<ast::EntityType>> =
    LazyLock::new(|| resource_type(["User"]));
fn user_id_to_euid(user_id: AccountId) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(&USER_PRINCIPAL_TYPE),
        ast::Eid::new(user_id.as_uuid().to_string()),
        None,
    )
}

static ORGANIZATION_PRINCIPAL_TYPE: LazyLock<Arc<ast::EntityType>> =
    LazyLock::new(|| resource_type(["Organization"]));
fn organization_id_to_euid(organization_id: Uuid) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(&ORGANIZATION_PRINCIPAL_TYPE),
        ast::Eid::new(organization_id.to_string()),
        None,
    )
}

static ORGANIZATION_ROLE_PRINCIPAL_TYPE: LazyLock<Arc<ast::EntityType>> =
    LazyLock::new(|| resource_type(["Organization", "Role"]));
fn organization_role_id_to_euid(role_id: Uuid) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(&ORGANIZATION_ROLE_PRINCIPAL_TYPE),
        ast::Eid::new(role_id.to_string()),
        None,
    )
}

static ACTION_TYPE: LazyLock<Arc<ast::EntityType>> = LazyLock::new(|| resource_type(["Action"]));
fn action_to_euid(action: Action) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(&ACTION_TYPE),
        ast::Eid::new(action.as_ref()),
        None,
    )
}
fn action_group_to_euid(action_group: ActionGroupName) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(&ACTION_TYPE),
        ast::Eid::new(action_group.as_ref()),
        None,
    )
}

static WEB_RESOURCE_TYPE: LazyLock<Arc<ast::EntityType>> = LazyLock::new(|| resource_type(["Web"]));
fn web_id_to_euid(web_id: OwnedById) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(&WEB_RESOURCE_TYPE),
        ast::Eid::new(web_id.as_uuid().to_string()),
        None,
    )
}

static ENTITY_RESOURCE_TYPE: LazyLock<Arc<ast::EntityType>> =
    LazyLock::new(|| resource_type(["Entity"]));
fn entity_uuid_to_euid(entity_uuid: EntityUuid) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(&ENTITY_RESOURCE_TYPE),
        ast::Eid::new(entity_uuid.as_uuid().to_string()),
        None,
    )
}

impl From<PrincipalConstraint> for ast::PrincipalConstraint {
    fn from(constraint: PrincipalConstraint) -> Self {
        match constraint {
            PrincipalConstraint::Public {} => Self::any(),
            PrincipalConstraint::User { user_id } => user_id
                .map_or_else(Self::is_eq_slot, |user_id| {
                    Self::is_eq(Arc::new(user_id_to_euid(user_id)))
                }),
            PrincipalConstraint::Organization(organization_role_constraint) => {
                match organization_role_constraint {
                    OrganizationRoleConstraint::Any { organization_id } => organization_id
                        .map_or_else(Self::is_in_slot, |organization_id| {
                            Self::is_in(Arc::new(organization_id_to_euid(organization_id)))
                        }),
                    OrganizationRoleConstraint::Exact { role_id } => role_id
                        .map_or_else(Self::is_in_slot, |role_id| {
                            Self::is_in(Arc::new(organization_role_id_to_euid(role_id)))
                        }),
                }
            }
        }
    }
}

impl From<ActionConstraint> for ast::ActionConstraint {
    fn from(constraint: ActionConstraint) -> Self {
        match constraint {
            ActionConstraint::All {} => Self::any(),
            ActionConstraint::Action { action } => Self::is_eq(action_to_euid(action)),
            ActionConstraint::Group {
                group: ActionGroup::Anoynmous(actions),
            } => Self::is_in(actions.into_iter().map(action_to_euid)),
            ActionConstraint::Group {
                group: ActionGroup::Named(action_group),
            } => Self::is_in(iter::once(action_group_to_euid(action_group))),
        }
    }
}

impl From<ResourceConstraint> for ast::ResourceConstraint {
    fn from(constraint: ResourceConstraint) -> Self {
        match constraint {
            ResourceConstraint::Global {} => Self::any(),
            ResourceConstraint::Web { web_id } => web_id.map_or_else(Self::is_in_slot, |web_id| {
                Self::is_in(Arc::new(web_id_to_euid(web_id)))
            }),
            ResourceConstraint::Entity(entity_resource_constraint) => {
                match entity_resource_constraint {
                    EntityResourceConstraint::Any {} => {
                        Self::is_entity_type(Arc::clone(&ENTITY_RESOURCE_TYPE))
                    }
                    EntityResourceConstraint::Exact { entity_uuid } => entity_uuid
                        .map_or_else(Self::is_eq_slot, |entity_uuid| {
                            Self::is_eq(Arc::new(entity_uuid_to_euid(entity_uuid)))
                        }),
                    EntityResourceConstraint::Web { web_id } => web_id.map_or_else(
                        || Self::is_entity_type_in_slot(Arc::clone(&ENTITY_RESOURCE_TYPE)),
                        |web_id| {
                            Self::is_entity_type_in(
                                Arc::clone(&ENTITY_RESOURCE_TYPE),
                                Arc::new(web_id_to_euid(web_id)),
                            )
                        },
                    ),
                }
            }
        }
    }
}

impl From<Policy> for ast::Template {
    fn from(policy: Policy) -> Self {
        Self::new(
            ast::PolicyID::from_string(policy.id.to_string()),
            None,
            ast::Annotations::new(),
            match policy.effect {
                Effect::Permit => ast::Effect::Permit,
                Effect::Forbid => ast::Effect::Forbid,
            },
            policy.principal.into(),
            policy.action.into(),
            policy.resource.into(),
            ast::Expr::val(true),
        )
    }
}
