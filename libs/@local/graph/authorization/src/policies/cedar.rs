use alloc::sync::Arc;
use core::{error::Error, iter, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, bail, ensure};
use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
use uuid::Uuid;

use crate::policies::{
    Action, ActionConstraint, ActionGroup, ActionGroupName, Effect, EntityResourceConstraint,
    OrganizationId, OrganizationPrincipalConstraint, OrganizationRoleId, Policy,
    PrincipalConstraint, ResourceConstraint, UserId, UserPrincipalConstraint,
    error::FromCedarRefernceError,
};

pub(crate) trait CedarEntityId: Sized + 'static {
    fn entity_type() -> &'static Arc<ast::EntityType>;

    fn to_eid(&self) -> ast::Eid;

    fn to_euid(&self) -> ast::EntityUID {
        ast::EntityUID::from_components(
            ast::EntityType::clone(Self::entity_type()),
            self.to_eid(),
            None,
        )
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>>;

    fn from_euid(
        euid: &ast::EntityUID,
    ) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        let entity_type = Self::entity_type();
        ensure!(
            *euid.entity_type() == **entity_type,
            FromCedarRefernceError::UnexpectedEntityType {
                expected: ast::EntityType::clone(entity_type),
                actual: euid.entity_type().clone(),
            }
        );
        Self::from_eid(euid.eid()).change_context(FromCedarRefernceError::FromCedarIdError)
    }
}

pub(crate) fn cedar_resource_type<const N: usize>(
    names: [&'static str; N],
) -> Arc<ast::EntityType> {
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

static ACTION_TYPE: LazyLock<Arc<ast::EntityType>> =
    LazyLock::new(|| cedar_resource_type(["Action"]));
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

impl From<PrincipalConstraint> for ast::PrincipalConstraint {
    fn from(constraint: PrincipalConstraint) -> Self {
        match constraint {
            PrincipalConstraint::Public {} => Self::any(),
            PrincipalConstraint::User(user) => match user {
                UserPrincipalConstraint::Any {} => {
                    Self::is_entity_type(Arc::clone(UserId::entity_type()))
                }
                UserPrincipalConstraint::Exact { user_id } => user_id
                    .map_or_else(Self::is_eq_slot, |user_id| {
                        Self::is_eq(Arc::new(user_id.to_euid()))
                    }),
                UserPrincipalConstraint::Organization(organization) => match organization {
                    OrganizationPrincipalConstraint::InOrganization { organization_id } => {
                        organization_id.map_or_else(
                            || Self::is_entity_type_in_slot(Arc::clone(UserId::entity_type())),
                            |organization_id| {
                                Self::is_entity_type_in(
                                    Arc::clone(UserId::entity_type()),
                                    Arc::new(organization_id.to_euid()),
                                )
                            },
                        )
                    }
                    OrganizationPrincipalConstraint::InRole {
                        organization_role_id,
                    } => organization_role_id.map_or_else(
                        || Self::is_entity_type_in_slot(Arc::clone(UserId::entity_type())),
                        |organization_role_id| {
                            Self::is_entity_type_in(
                                Arc::clone(UserId::entity_type()),
                                Arc::new(organization_role_id.to_euid()),
                            )
                        },
                    ),
                },
            },
            PrincipalConstraint::Organization(organization) => match organization {
                OrganizationPrincipalConstraint::InOrganization { organization_id } => {
                    organization_id.map_or_else(Self::is_in_slot, |organization_id| {
                        Self::is_in(Arc::new(organization_id.to_euid()))
                    })
                }
                OrganizationPrincipalConstraint::InRole {
                    organization_role_id,
                } => organization_role_id.map_or_else(Self::is_in_slot, |organization_role_id| {
                    Self::is_in(Arc::new(organization_role_id.to_euid()))
                }),
            },
        }
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum FromConstraintError {
    #[display("Cannot convert constraints containing slots")]
    AmbiguousSlot,
    #[error(ignore)]
    #[display("Unexpected entity type: {_0}")]
    UnexpectedEntityType(String),
    #[display("Invalid principal ID")]
    InvalidPrincipalId,
}

impl TryFrom<ast::PrincipalConstraint> for PrincipalConstraint {
    type Error = Report<FromConstraintError>;

    fn try_from(constraint: ast::PrincipalConstraint) -> Result<Self, Self::Error> {
        Ok(match constraint.into_inner() {
            ast::PrincipalOrResourceConstraint::Any => Self::Public {},

            ast::PrincipalOrResourceConstraint::Is(principal_type)
                if *principal_type == **UserId::entity_type() =>
            {
                Self::User(UserPrincipalConstraint::Any {})
            }
            ast::PrincipalOrResourceConstraint::Is(principal_type) => bail!(
                FromConstraintError::UnexpectedEntityType(principal_type.to_string())
            ),

            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(principal))
                if *principal.entity_type() == **UserId::entity_type() =>
            {
                Self::User(UserPrincipalConstraint::Exact {
                    user_id: Some(
                        UserId::from_eid(principal.eid())
                            .change_context(FromConstraintError::InvalidPrincipalId)?,
                    ),
                })
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(principal)) => bail!(
                FromConstraintError::UnexpectedEntityType(principal.entity_type().to_string())
            ),
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::Slot(_)) => {
                bail!(FromConstraintError::AmbiguousSlot)
            }

            ast::PrincipalOrResourceConstraint::IsIn(
                principal_type,
                ast::EntityReference::EUID(principal),
            ) if *principal_type == **UserId::entity_type() => {
                if *principal.entity_type() == **OrganizationId::entity_type() {
                    Self::User(UserPrincipalConstraint::Organization(
                        OrganizationPrincipalConstraint::InOrganization {
                            organization_id: Some(
                                OrganizationId::from_eid(principal.eid())
                                    .change_context(FromConstraintError::InvalidPrincipalId)?,
                            ),
                        },
                    ))
                } else if *principal.entity_type() == **OrganizationRoleId::entity_type() {
                    Self::User(UserPrincipalConstraint::Organization(
                        OrganizationPrincipalConstraint::InRole {
                            organization_role_id: Some(
                                OrganizationRoleId::from_eid(principal.eid())
                                    .change_context(FromConstraintError::InvalidPrincipalId)?,
                            ),
                        },
                    ))
                } else {
                    bail!(FromConstraintError::UnexpectedEntityType(
                        principal.entity_type().to_string(),
                    ))
                }
            }
            ast::PrincipalOrResourceConstraint::IsIn(
                principal_type,
                ast::EntityReference::EUID(_),
            ) => bail!(FromConstraintError::UnexpectedEntityType(
                principal_type.to_string(),
            )),
            ast::PrincipalOrResourceConstraint::IsIn(_, ast::EntityReference::Slot(_)) => {
                bail!(FromConstraintError::AmbiguousSlot)
            }

            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal))
                if *principal.entity_type() == **OrganizationId::entity_type() =>
            {
                Self::Organization(OrganizationPrincipalConstraint::InOrganization {
                    organization_id: Some(
                        OrganizationId::from_eid(principal.eid())
                            .change_context(FromConstraintError::InvalidPrincipalId)?,
                    ),
                })
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal))
                if *principal.entity_type() == **OrganizationRoleId::entity_type() =>
            {
                Self::Organization(OrganizationPrincipalConstraint::InRole {
                    organization_role_id: Some(
                        OrganizationRoleId::from_eid(principal.eid())
                            .change_context(FromConstraintError::InvalidPrincipalId)?,
                    ),
                })
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal)) => bail!(
                FromConstraintError::UnexpectedEntityType(principal.entity_type().to_string())
            ),
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::Slot(_)) => {
                bail!(FromConstraintError::AmbiguousSlot)
            }
        })
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
                Self::is_in(Arc::new(web_id.to_euid()))
            }),
            ResourceConstraint::Entity(entity_resource_constraint) => {
                match entity_resource_constraint {
                    EntityResourceConstraint::Any {} => {
                        Self::is_entity_type(Arc::clone(EntityUuid::entity_type()))
                    }
                    EntityResourceConstraint::Exact { entity_uuid } => entity_uuid
                        .map_or_else(Self::is_eq_slot, |entity_uuid| {
                            Self::is_eq(Arc::new(entity_uuid.to_euid()))
                        }),
                    EntityResourceConstraint::Web { web_id } => web_id.map_or_else(
                        || Self::is_entity_type_in_slot(Arc::clone(EntityUuid::entity_type())),
                        |web_id| {
                            Self::is_entity_type_in(
                                Arc::clone(EntityUuid::entity_type()),
                                Arc::new(web_id.to_euid()),
                            )
                        },
                    ),
                }
            }
        }
    }
}

impl TryFrom<ast::ResourceConstraint> for ResourceConstraint {
    type Error = Report<FromConstraintError>;

    fn try_from(constraint: ast::ResourceConstraint) -> Result<Self, Self::Error> {
        Ok(match constraint.into_inner() {
            ast::PrincipalOrResourceConstraint::Any => Self::Global {},

            ast::PrincipalOrResourceConstraint::Is(principal_type)
                if *principal_type == **EntityUuid::entity_type() =>
            {
                Self::Entity(EntityResourceConstraint::Any {})
            }
            ast::PrincipalOrResourceConstraint::Is(principal_type) => bail!(
                FromConstraintError::UnexpectedEntityType(principal_type.to_string())
            ),

            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(principal))
                if *principal.entity_type() == **EntityUuid::entity_type() =>
            {
                Self::Entity(EntityResourceConstraint::Exact {
                    entity_uuid: Some(EntityUuid::new(
                        Uuid::from_str(principal.eid().as_ref())
                            .change_context(FromConstraintError::InvalidPrincipalId)?,
                    )),
                })
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(principal)) => bail!(
                FromConstraintError::UnexpectedEntityType(principal.entity_type().to_string())
            ),
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::Slot(_)) => {
                bail!(FromConstraintError::AmbiguousSlot)
            }

            ast::PrincipalOrResourceConstraint::IsIn(
                principal_type,
                ast::EntityReference::EUID(principal),
            ) if *principal_type == **EntityUuid::entity_type() => {
                if *principal.entity_type() == **OwnedById::entity_type() {
                    Self::Entity(EntityResourceConstraint::Web {
                        web_id: Some(OwnedById::new(
                            Uuid::from_str(principal.eid().as_ref())
                                .change_context(FromConstraintError::InvalidPrincipalId)?,
                        )),
                    })
                } else {
                    bail!(FromConstraintError::UnexpectedEntityType(
                        principal.entity_type().to_string(),
                    ))
                }
            }
            ast::PrincipalOrResourceConstraint::IsIn(
                principal_type,
                ast::EntityReference::EUID(_),
            ) => bail!(FromConstraintError::UnexpectedEntityType(
                principal_type.to_string(),
            )),
            ast::PrincipalOrResourceConstraint::IsIn(_, ast::EntityReference::Slot(_)) => {
                bail!(FromConstraintError::AmbiguousSlot)
            }

            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal))
                if *principal.entity_type() == **OwnedById::entity_type() =>
            {
                Self::Web {
                    web_id: Some(OwnedById::new(
                        Uuid::from_str(principal.eid().as_ref())
                            .change_context(FromConstraintError::InvalidPrincipalId)?,
                    )),
                }
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal)) => bail!(
                FromConstraintError::UnexpectedEntityType(principal.entity_type().to_string())
            ),
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::Slot(_)) => {
                bail!(FromConstraintError::AmbiguousSlot)
            }
        })
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
