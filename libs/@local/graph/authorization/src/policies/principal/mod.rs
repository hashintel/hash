#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, bail};
use type_system::web::OwnedById;
use uuid::Uuid;

pub use self::actor::{Actor, ActorId};
use self::{
    machine::{MachineId, MachinePrincipalConstraint},
    role::RoleId,
    team::{StandaloneTeamId, TeamId, TeamPrincipalConstraint, TeamRoleId},
    user::{UserId, UserPrincipalConstraint},
    web::{WebPrincipalConstraint, WebRoleId, WebTeamId, WebTeamRoleId},
};
use super::cedar::CedarEntityId as _;

mod actor;
pub mod machine;
pub mod role;
pub mod team;
pub mod user;
pub mod web;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub enum PrincipalId {
    Actor(ActorId),
    Team(TeamId),
    Role(RoleId),
}

impl PrincipalId {
    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        match self {
            Self::Actor(actor_id) => actor_id.as_uuid(),
            Self::Team(team_id) => team_id.as_uuid(),
            Self::Role(role_id) => role_id.as_uuid(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PrincipalConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
    Public {},
    User(UserPrincipalConstraint),
    Machine(MachinePrincipalConstraint),
    Web(WebPrincipalConstraint),
    Team(TeamPrincipalConstraint),
}

enum InPrincipalConstraint {
    Web(WebPrincipalConstraint),
    Team(TeamPrincipalConstraint),
}

impl InPrincipalConstraint {
    pub(crate) fn try_from_cedar_in(
        principal: &ast::EntityUID,
    ) -> Result<Self, Report<InvalidPrincipalConstraint>> {
        if *principal.entity_type() == **OwnedById::entity_type() {
            Ok(Self::Web(WebPrincipalConstraint::InWeb {
                id: Some(
                    OwnedById::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            }))
        } else if *principal.entity_type() == **WebRoleId::entity_type() {
            Ok(Self::Web(WebPrincipalConstraint::InRole {
                role_id: Some(
                    WebRoleId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            }))
        } else if *principal.entity_type() == **WebTeamId::entity_type() {
            Ok(Self::Web(WebPrincipalConstraint::InTeam {
                team_id: Some(
                    WebTeamId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            }))
        } else if *principal.entity_type() == **WebTeamRoleId::entity_type() {
            Ok(Self::Web(WebPrincipalConstraint::InTeamRole {
                team_role_id: Some(
                    WebTeamRoleId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            }))
        } else if *principal.entity_type() == **StandaloneTeamId::entity_type() {
            Ok(Self::Team(TeamPrincipalConstraint::InTeam {
                id: Some(
                    StandaloneTeamId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            }))
        } else if *principal.entity_type() == **TeamRoleId::entity_type() {
            Ok(Self::Team(TeamPrincipalConstraint::InRole {
                role_id: Some(
                    TeamRoleId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            }))
        } else {
            bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                ast::EntityType::clone(principal.entity_type())
            ))
        }
    }
}

impl From<InPrincipalConstraint> for PrincipalConstraint {
    fn from(value: InPrincipalConstraint) -> Self {
        match value {
            InPrincipalConstraint::Web(web) => Self::Web(web),
            InPrincipalConstraint::Team(team) => Self::Team(team),
        }
    }
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

impl PrincipalConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Public {} => false,
            Self::User(user) => user.has_slot(),
            Self::Machine(machine) => machine.has_slot(),
            Self::Web(web) => web.has_slot(),
            Self::Team(team) => team.has_slot(),
        }
    }

    pub(crate) fn try_from_cedar(
        constraint: &ast::PrincipalConstraint,
    ) -> Result<Self, Report<InvalidPrincipalConstraint>> {
        Ok(match constraint.as_inner() {
            ast::PrincipalOrResourceConstraint::Any => Self::Public {},
            ast::PrincipalOrResourceConstraint::Is(principal_type) => {
                Self::try_from_cedar_is_in(principal_type, None)?
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(entity_ref)) => {
                Self::try_from_cedar_eq(entity_ref)?
            }
            ast::PrincipalOrResourceConstraint::IsIn(
                principal_type,
                ast::EntityReference::EUID(entity_ref),
            ) => Self::try_from_cedar_is_in(principal_type, Some(entity_ref))?,
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(principal)) => {
                Self::from(InPrincipalConstraint::try_from_cedar_in(principal)?)
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::Slot(_))
            | ast::PrincipalOrResourceConstraint::IsIn(_, ast::EntityReference::Slot(_))
            | ast::PrincipalOrResourceConstraint::In(ast::EntityReference::Slot(_)) => {
                bail!(InvalidPrincipalConstraint::AmbiguousSlot);
            }
        })
    }

    pub(crate) fn try_from_cedar_eq(
        principal: &ast::EntityUID,
    ) -> Result<Self, Report<InvalidPrincipalConstraint>> {
        if *principal.entity_type() == **UserId::entity_type() {
            Ok(Self::User(UserPrincipalConstraint::Exact {
                user_id: Some(
                    UserId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            }))
        } else if *principal.entity_type() == **MachineId::entity_type() {
            Ok(Self::Machine(MachinePrincipalConstraint::Exact {
                machine_id: Some(
                    MachineId::from_eid(principal.eid())
                        .change_context(InvalidPrincipalConstraint::InvalidPrincipalId)?,
                ),
            }))
        } else {
            bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                ast::EntityType::clone(principal.entity_type())
            ))
        }
    }

    pub(crate) fn try_from_cedar_is_in(
        principal_type: &ast::EntityType,
        in_principal: Option<&ast::EntityUID>,
    ) -> Result<Self, Report<InvalidPrincipalConstraint>> {
        if *principal_type == **UserId::entity_type() {
            let Some(in_principal) = in_principal else {
                return Ok(Self::User(UserPrincipalConstraint::Any {}));
            };
            Ok(Self::User(UserPrincipalConstraint::from(
                InPrincipalConstraint::try_from_cedar_in(in_principal)?,
            )))
        } else if *principal_type == **MachineId::entity_type() {
            let Some(in_principal) = in_principal else {
                return Ok(Self::Machine(MachinePrincipalConstraint::Any {}));
            };
            Ok(Self::Machine(MachinePrincipalConstraint::from(
                InPrincipalConstraint::try_from_cedar_in(in_principal)?,
            )))
        } else {
            bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                ast::EntityType::clone(principal_type)
            ))
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::PrincipalConstraint {
        match self {
            Self::Public {} => ast::PrincipalConstraint::any(),
            Self::User(user) => user.to_cedar(),
            Self::Machine(machine) => machine.to_cedar(),
            Self::Web(organization) => organization.to_cedar(),
            Self::Team(team) => team.to_cedar(),
        }
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

    use super::PrincipalConstraint;
    use crate::{
        policies::{
            Effect, Policy, PolicyId, action::ActionConstraint, resource::ResourceConstraint,
            tests::check_policy,
        },
        test_utils::{check_deserialization_error, check_serialization},
    };

    #[track_caller]
    pub(crate) fn check_principal(
        constraint: PrincipalConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        let cedar_constraint = constraint.to_cedar();
        let cedar_string = cedar_string.as_ref();

        assert_eq!(cedar_constraint.to_string(), cedar_string);
        if !constraint.has_slot() {
            PrincipalConstraint::try_from_cedar(&cedar_constraint)?;
        }

        let policy = Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: constraint,
            action: ActionConstraint::All {},
            resource: ResourceConstraint::Global {},
            constraints: None,
        };

        check_policy(
            &policy,
            json!({
                "id": policy.id,
                "effect": "permit",
                "principal": &value,
                "action": {
                    "type": "all",
                },
                "resource": {
                    "type": "global",
                },
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

        Ok(())
    }

    #[test]
    fn constraint_public() -> Result<(), Box<dyn Error>> {
        check_principal(
            PrincipalConstraint::Public {},
            json!({
                "type": "public",
            }),
            "principal",
        )?;

        check_deserialization_error::<PrincipalConstraint>(
            json!({
                "type": "public",
                "additional": "unexpected"
            }),
            "unknown field `additional`, there are no fields",
        )?;

        Ok(())
    }
}
