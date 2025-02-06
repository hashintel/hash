use alloc::sync::Arc;
use core::{error::Error, iter, str::FromStr as _};

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, TryReportIteratorExt, bail, ensure};
use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
use uuid::Uuid;

use crate::policies::{
    ActionConstraint, ActionId, Effect, EntityResourceConstraint, OrganizationId,
    OrganizationPrincipalConstraint, OrganizationRoleId, Policy, PolicyId, PrincipalConstraint,
    ResourceConstraint, UserId, UserPrincipalConstraint, error::FromCedarRefernceError,
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

    fn from_euid(euid: &ast::EntityUID) -> Result<Self, Report<FromCedarRefernceError>> {
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

impl From<PrincipalConstraint> for ast::PrincipalConstraint {
    fn from(constraint: PrincipalConstraint) -> Self {
        Self::from(&constraint)
    }
}

impl From<&PrincipalConstraint> for ast::PrincipalConstraint {
    fn from(constraint: &PrincipalConstraint) -> Self {
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
pub enum InvalidPrincipalConstraint {
    #[display("Cannot convert constraints containing slots")]
    AmbiguousSlot,
    #[error(ignore)]
    #[display("Unexpected entity type: {_0}")]
    UnexpectedEntityType(ast::EntityType),
    #[display("Invalid principal ID")]
    InvalidPrincipalId,
}

impl TryFrom<ast::PrincipalConstraint> for PrincipalConstraint {
    type Error = Report<InvalidPrincipalConstraint>;

    fn try_from(constraint: ast::PrincipalConstraint) -> Result<Self, Self::Error> {
        PrincipalConstraint::try_from(&constraint)
    }
}
impl TryFrom<&ast::PrincipalConstraint> for PrincipalConstraint {
    type Error = Report<InvalidPrincipalConstraint>;

    fn try_from(constraint: &ast::PrincipalConstraint) -> Result<Self, Self::Error> {
        Ok(match constraint.as_inner() {
            ast::PrincipalOrResourceConstraint::Any => Self::Public {},

            ast::PrincipalOrResourceConstraint::Is(principal_type)
                if **principal_type == **UserId::entity_type() =>
            {
                Self::User(UserPrincipalConstraint::Any {})
            }
            ast::PrincipalOrResourceConstraint::Is(principal_type) => {
                bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                    ast::EntityType::clone(&principal_type)
                ))
            }

            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(principal))
                if *principal.entity_type() == **UserId::entity_type() =>
            {
                Self::User(UserPrincipalConstraint::Exact {
                    user_id: Some(
                        UserId::from_eid(principal.eid())
                            .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                    ),
                })
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(principal)) => {
                bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                    ast::EntityType::clone(principal.entity_type())
                ))
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::Slot(_)) => {
                bail!(InvalidPrincipalConstraint::AmbiguousSlot)
            }

            ast::PrincipalOrResourceConstraint::IsIn(
                principal_type,
                ast::EntityReference::EUID(principal),
            ) if **principal_type == **UserId::entity_type() => {
                if *principal.entity_type() == **OrganizationId::entity_type() {
                    Self::User(UserPrincipalConstraint::Organization(
                        OrganizationPrincipalConstraint::InOrganization {
                            organization_id: Some(
                                OrganizationId::from_eid(principal.eid()).change_context(
                                    InvalidPrincipalConstraint::InvalidPrincipalId,
                                )?,
                            ),
                        },
                    ))
                } else if *principal.entity_type() == **OrganizationRoleId::entity_type() {
                    Self::User(UserPrincipalConstraint::Organization(
                        OrganizationPrincipalConstraint::InRole {
                            organization_role_id: Some(
                                OrganizationRoleId::from_eid(principal.eid()).change_context(
                                    InvalidPrincipalConstraint::InvalidPrincipalId,
                                )?,
                            ),
                        },
                    ))
                } else {
                    bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                        ast::EntityType::clone(principal.entity_type())
                    ))
                }
            }
            ast::PrincipalOrResourceConstraint::IsIn(
                principal_type,
                ast::EntityReference::EUID(_),
            ) => bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                ast::EntityType::clone(&principal_type)
            )),
            ast::PrincipalOrResourceConstraint::IsIn(_, ast::EntityReference::Slot(_)) => {
                bail!(InvalidPrincipalConstraint::AmbiguousSlot)
            }

            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal))
                if *principal.entity_type() == **OrganizationId::entity_type() =>
            {
                Self::Organization(OrganizationPrincipalConstraint::InOrganization {
                    organization_id: Some(
                        OrganizationId::from_eid(principal.eid())
                            .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                    ),
                })
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal))
                if *principal.entity_type() == **OrganizationRoleId::entity_type() =>
            {
                Self::Organization(OrganizationPrincipalConstraint::InRole {
                    organization_role_id: Some(
                        OrganizationRoleId::from_eid(principal.eid())
                            .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                    ),
                })
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal)) => {
                bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                    ast::EntityType::clone(principal.entity_type())
                ))
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::Slot(_)) => {
                bail!(InvalidPrincipalConstraint::AmbiguousSlot)
            }
        })
    }
}

impl From<ActionConstraint> for ast::ActionConstraint {
    fn from(constraint: ActionConstraint) -> Self {
        Self::from(&constraint)
    }
}

impl From<&ActionConstraint> for ast::ActionConstraint {
    fn from(constraint: &ActionConstraint) -> Self {
        match constraint {
            ActionConstraint::All {} => Self::any(),
            ActionConstraint::One { action } => Self::is_eq(action.to_euid()),
            ActionConstraint::Many { actions } => {
                Self::is_in(actions.iter().map(ActionId::to_euid))
            }
        }
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum InvalidActionConstraint {
    #[display("Invalid action in constraint")]
    InvalidAction,
}

impl TryFrom<ast::ActionConstraint> for ActionConstraint {
    type Error = Report<InvalidActionConstraint>;

    fn try_from(constraint: ast::ActionConstraint) -> Result<Self, Self::Error> {
        Self::try_from(&constraint)
    }
}

impl TryFrom<&ast::ActionConstraint> for ActionConstraint {
    type Error = Report<InvalidActionConstraint>;

    fn try_from(constraint: &ast::ActionConstraint) -> Result<Self, Self::Error> {
        Ok(match constraint {
            ast::ActionConstraint::Any {} => Self::All {},
            ast::ActionConstraint::Eq(action) => Self::One {
                action: ActionId::from_euid(action)
                    .change_context(InvalidActionConstraint::InvalidAction)?,
            },
            ast::ActionConstraint::In(actions) => Self::Many {
                actions: actions
                    .iter()
                    .map(|action| ActionId::from_euid(action))
                    .try_collect_reports()
                    .change_context(InvalidActionConstraint::InvalidAction)?,
            },
        })
    }
}

impl From<ResourceConstraint> for ast::ResourceConstraint {
    fn from(constraint: ResourceConstraint) -> Self {
        Self::from(&constraint)
    }
}

impl From<&ResourceConstraint> for ast::ResourceConstraint {
    fn from(constraint: &ResourceConstraint) -> Self {
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

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum InvalidResourceConstraint {
    #[display("Cannot convert constraints containing slots")]
    AmbiguousSlot,
    #[error(ignore)]
    #[display("Unexpected entity type: {_0}")]
    UnexpectedEntityType(ast::EntityType),
    #[display("Invalid resource ID")]
    InvalidPrincipalId,
}
impl TryFrom<ast::ResourceConstraint> for ResourceConstraint {
    type Error = Report<InvalidResourceConstraint>;

    fn try_from(constraint: ast::ResourceConstraint) -> Result<Self, Self::Error> {
        Self::try_from(&constraint)
    }
}

impl TryFrom<&ast::ResourceConstraint> for ResourceConstraint {
    type Error = Report<InvalidResourceConstraint>;

    fn try_from(constraint: &ast::ResourceConstraint) -> Result<Self, Self::Error> {
        Ok(match constraint.as_inner() {
            ast::PrincipalOrResourceConstraint::Any => Self::Global {},

            ast::PrincipalOrResourceConstraint::Is(resource_type)
                if **resource_type == **EntityUuid::entity_type() =>
            {
                Self::Entity(EntityResourceConstraint::Any {})
            }
            ast::PrincipalOrResourceConstraint::Is(resource_type) => {
                bail!(InvalidResourceConstraint::UnexpectedEntityType(
                    ast::EntityType::clone(resource_type)
                ))
            }

            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(resource))
                if *resource.entity_type() == **EntityUuid::entity_type() =>
            {
                Self::Entity(EntityResourceConstraint::Exact {
                    entity_uuid: Some(EntityUuid::new(
                        Uuid::from_str(resource.eid().as_ref())
                            .change_context(InvalidResourceConstraint::InvalidPrincipalId)?,
                    )),
                })
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(principal)) => {
                bail!(InvalidResourceConstraint::UnexpectedEntityType(
                    principal.entity_type().clone()
                ))
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::Slot(_)) => {
                bail!(InvalidResourceConstraint::AmbiguousSlot)
            }

            ast::PrincipalOrResourceConstraint::IsIn(
                resource_type,
                ast::EntityReference::EUID(resource),
            ) if **resource_type == **EntityUuid::entity_type() => {
                if *resource.entity_type() == **OwnedById::entity_type() {
                    Self::Entity(EntityResourceConstraint::Web {
                        web_id: Some(OwnedById::new(
                            Uuid::from_str(resource.eid().as_ref())
                                .change_context(InvalidResourceConstraint::InvalidPrincipalId)?,
                        )),
                    })
                } else {
                    bail!(InvalidResourceConstraint::UnexpectedEntityType(
                        resource.entity_type().clone()
                    ))
                }
            }
            ast::PrincipalOrResourceConstraint::IsIn(
                resource_type,
                ast::EntityReference::EUID(_),
            ) => bail!(InvalidResourceConstraint::UnexpectedEntityType(
                ast::EntityType::clone(&resource_type)
            )),
            ast::PrincipalOrResourceConstraint::IsIn(_, ast::EntityReference::Slot(_)) => {
                bail!(InvalidResourceConstraint::AmbiguousSlot)
            }

            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(resource))
                if *resource.entity_type() == **OwnedById::entity_type() =>
            {
                Self::Web {
                    web_id: Some(OwnedById::new(
                        Uuid::from_str(resource.eid().as_ref())
                            .change_context(InvalidResourceConstraint::InvalidPrincipalId)?,
                    )),
                }
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(resource)) => {
                bail!(InvalidResourceConstraint::UnexpectedEntityType(
                    resource.entity_type().clone()
                ))
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::Slot(_)) => {
                bail!(InvalidResourceConstraint::AmbiguousSlot)
            }
        })
    }
}

impl From<Policy> for ast::Template {
    fn from(policy: Policy) -> Self {
        Self::from(&policy)
    }
}

impl From<&Policy> for ast::Template {
    fn from(policy: &Policy) -> Self {
        Self::new(
            ast::PolicyID::from_string(policy.id.to_string()),
            None,
            ast::Annotations::new(),
            match policy.effect {
                Effect::Permit => ast::Effect::Permit,
                Effect::Forbid => ast::Effect::Forbid,
            },
            (&policy.principal).into(),
            (&policy.action).into(),
            (&policy.resource).into(),
            ast::Expr::val(true),
        )
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
}

impl TryFrom<ast::Template> for Policy {
    type Error = Report<InvalidPolicy>;

    fn try_from(policy: ast::Template) -> Result<Self, Self::Error> {
        Ok(Self {
            id: PolicyId::new(
                Uuid::from_str(policy.id().as_ref()).change_context(InvalidPolicy::InvalidId)?,
            ),
            effect: match policy.effect() {
                ast::Effect::Permit => Effect::Permit,
                ast::Effect::Forbid => Effect::Forbid,
            },
            principal: PrincipalConstraint::try_from(policy.principal_constraint())
                .change_context(InvalidPolicy::InvalidPrincipalConstraint)?,
            action: ActionConstraint::try_from(policy.action_constraint())
                .change_context(InvalidPolicy::InvalidActionConstraint)?,
            resource: ResourceConstraint::try_from(policy.resource_constraint())
                .change_context(InvalidPolicy::InvalidResourceConstraint)?,
            constraints: None,
        })
    }
}
