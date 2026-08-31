use alloc::sync::Arc;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, bail};
use type_system::principal::{
    PrincipalId,
    actor::{ActorId, ActorType, AiId, MachineId, UserId},
    actor_group::{ActorGroupId, TeamId, WebId},
    role::{RoleId, TeamRoleId, WebRoleId},
};

use super::cedar::{FromCedarEntityId as _, ToCedarEntityId as _};

pub mod actor;
pub mod group;
pub mod role;

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum PrincipalConstraint {
    #[serde(rename_all = "camelCase")]
    Actor {
        #[serde(flatten)]
        actor: ActorId,
    },
    #[serde(rename_all = "camelCase")]
    ActorType { actor_type: ActorType },
    #[serde(rename_all = "camelCase")]
    ActorGroup {
        #[serde(flatten)]
        actor_group: ActorGroupId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        actor_type: Option<ActorType>,
    },
    #[serde(rename_all = "camelCase")]
    Role {
        #[serde(flatten)]
        role: RoleId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        actor_type: Option<ActorType>,
    },
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum InvalidPrincipalConstraint {
    #[display("Cannot convert constraints containing slots")]
    AmbiguousSlot,
    #[error(ignore)]
    #[display("Unexpected entity type: {_0}")]
    UnexpectedEntityType(ast::EntityType),
    #[display("Invalid principal ID")]
    InvalidPrincipalId,
}

fn actor_type_to_cedar(actor_type: ActorType) -> &'static Arc<ast::EntityType> {
    match actor_type {
        ActorType::User => UserId::entity_type(),
        ActorType::Machine => MachineId::entity_type(),
        ActorType::Ai => AiId::entity_type(),
    }
}

fn actor_type_from_cedar(
    actor_type: &ast::EntityType,
) -> Result<ActorType, Report<InvalidPrincipalConstraint>> {
    if *actor_type == **UserId::entity_type() {
        Ok(ActorType::User)
    } else if *actor_type == **MachineId::entity_type() {
        Ok(ActorType::Machine)
    } else if *actor_type == **AiId::entity_type() {
        Ok(ActorType::Ai)
    } else {
        Err(Report::new(
            InvalidPrincipalConstraint::UnexpectedEntityType(ast::EntityType::clone(actor_type)),
        ))
    }
}

impl PrincipalConstraint {
    #[must_use]
    pub const fn to_parts(&self) -> (Option<PrincipalId>, Option<ActorType>) {
        match self {
            Self::ActorType { actor_type } => (None, Some(*actor_type)),
            Self::Actor { actor } => (Some(PrincipalId::Actor(*actor)), None),
            Self::ActorGroup {
                actor_group,
                actor_type,
            } => (Some(PrincipalId::ActorGroup(*actor_group)), *actor_type),
            Self::Role { role, actor_type } => (Some(PrincipalId::Role(*role)), *actor_type),
        }
    }

    pub(crate) fn try_from_cedar(
        constraint: &ast::PrincipalConstraint,
    ) -> Result<Option<Self>, Report<InvalidPrincipalConstraint>> {
        Ok(match constraint.as_inner() {
            ast::PrincipalOrResourceConstraint::Any => None,
            ast::PrincipalOrResourceConstraint::Is(principal_type) => Some(Self::ActorType {
                actor_type: actor_type_from_cedar(principal_type)?,
            }),
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(entity_ref)) => {
                Some(Self::try_from_cedar_eq(entity_ref)?)
            }
            ast::PrincipalOrResourceConstraint::IsIn(
                principal_type,
                ast::EntityReference::EUID(entity_ref),
            ) => Some(Self::try_from_cedar_is_in(
                Some(principal_type),
                entity_ref,
            )?),
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal)) => {
                Some(Self::try_from_cedar_is_in(None, principal)?)
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::Slot(_))
            | ast::PrincipalOrResourceConstraint::IsIn(_, ast::EntityReference::Slot(_))
            | ast::PrincipalOrResourceConstraint::In(ast::EntityReference::Slot(_)) => {
                bail!(InvalidPrincipalConstraint::AmbiguousSlot);
            }
        })
    }

    fn try_from_cedar_eq(
        principal: &ast::EntityUID,
    ) -> Result<Self, Report<InvalidPrincipalConstraint>> {
        if *principal.entity_type() == **UserId::entity_type() {
            Ok(Self::Actor {
                actor: ActorId::User(
                    UserId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            })
        } else if *principal.entity_type() == **MachineId::entity_type() {
            Ok(Self::Actor {
                actor: ActorId::Machine(
                    MachineId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            })
        } else if *principal.entity_type() == **AiId::entity_type() {
            Ok(Self::Actor {
                actor: ActorId::Ai(
                    AiId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            })
        } else {
            Err(Report::new(
                InvalidPrincipalConstraint::UnexpectedEntityType(ast::EntityType::clone(
                    principal.entity_type(),
                )),
            ))
        }
    }

    fn try_from_cedar_is_in(
        principal_type: Option<&ast::EntityType>,
        in_principal: &ast::EntityUID,
    ) -> Result<Self, Report<InvalidPrincipalConstraint>> {
        let actor_type = principal_type.map(actor_type_from_cedar).transpose()?;

        if *in_principal.entity_type() == **WebId::entity_type() {
            Ok(Self::ActorGroup {
                actor_type,
                actor_group: ActorGroupId::Web(
                    WebId::from_eid(in_principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            })
        } else if *in_principal.entity_type() == **WebRoleId::entity_type() {
            Ok(Self::Role {
                actor_type,
                role: RoleId::Web(
                    WebRoleId::from_eid(in_principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            })
        } else if *in_principal.entity_type() == **TeamId::entity_type() {
            Ok(Self::ActorGroup {
                actor_type,
                actor_group: ActorGroupId::Team(
                    TeamId::from_eid(in_principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            })
        } else if *in_principal.entity_type() == **TeamRoleId::entity_type() {
            Ok(Self::Role {
                actor_type,
                role: RoleId::Team(
                    TeamRoleId::from_eid(in_principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            })
        } else {
            Err(Report::new(
                InvalidPrincipalConstraint::UnexpectedEntityType(ast::EntityType::clone(
                    in_principal.entity_type(),
                )),
            ))
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::PrincipalConstraint {
        match self {
            Self::ActorType { actor_type } => ast::PrincipalConstraint::is_entity_type(Arc::clone(
                actor_type_to_cedar(*actor_type),
            )),
            Self::Actor { actor } => ast::PrincipalConstraint::is_eq(Arc::new(actor.to_euid())),
            Self::ActorGroup {
                actor_group: team,
                actor_type,
            } => actor_type.as_ref().map_or_else(
                || ast::PrincipalConstraint::is_in(Arc::new(team.to_euid())),
                |actor_type| {
                    ast::PrincipalConstraint::is_entity_type_in(
                        Arc::clone(actor_type_to_cedar(*actor_type)),
                        Arc::new(team.to_euid()),
                    )
                },
            ),
            Self::Role { role, actor_type } => actor_type.as_ref().map_or_else(
                || ast::PrincipalConstraint::is_in(Arc::new(role.to_euid())),
                |actor_type| {
                    ast::PrincipalConstraint::is_entity_type_in(
                        Arc::clone(actor_type_to_cedar(*actor_type)),
                        Arc::new(role.to_euid()),
                    )
                },
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use indoc::formatdoc;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use super::PrincipalConstraint;
    use crate::{
        policies::{ActionName, Effect, Policy, PolicyId, tests::check_policy},
        test_utils::check_serialization,
    };

    #[track_caller]
    pub(crate) fn check_principal(
        constraint: PrincipalConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        let cedar_string = cedar_string.as_ref();

        let policy = Policy {
            id: PolicyId::new(Uuid::new_v4()),
            name: None,
            effect: Effect::Permit,
            principal: Some(constraint),
            actions: vec![ActionName::All],
            resource: None,
            constraints: None,
        };
        let cedar_policy = policy.to_cedar_static_policy()?;

        assert_eq!(
            cedar_policy.principal_constraint().to_string(),
            cedar_string
        );

        check_policy(
            &policy,
            json!({
                "id": policy.id,
                "effect": "permit",
                "principal": &value,
                "actions": ["all"],
                "resource": null,
            }),
            formatdoc!(
                "permit(
                  {cedar_string},
                  action,
                  resource
                ) when {{
                  true
                }};"
            ),
        )?;

        check_serialization(&policy.principal, value);

        let parsed_policy = Policy::try_from_cedar(&cedar_policy)?;
        assert_eq!(parsed_policy, policy);

        Ok(())
    }
}
