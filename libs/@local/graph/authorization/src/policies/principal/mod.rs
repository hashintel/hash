#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, bail};

pub use self::{
    organization::{OrganizationId, OrganizationPrincipalConstraint, OrganizationRoleId},
    user::{UserId, UserPrincipalConstraint},
};
use super::cedar::CedarEntityId as _;

mod organization;
mod user;

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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
    Organization(OrganizationPrincipalConstraint),
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
            Self::Organization(organization) => organization.has_slot(),
        }
    }

    pub(crate) fn try_from_cedar(
        constraint: &ast::PrincipalConstraint,
    ) -> Result<Self, Report<InvalidPrincipalConstraint>> {
        Ok(match constraint.as_inner() {
            ast::PrincipalOrResourceConstraint::Any => Self::Public {},

            ast::PrincipalOrResourceConstraint::Is(principal_type)
                if **principal_type == **UserId::entity_type() =>
            {
                Self::User(UserPrincipalConstraint::Any {})
            }
            ast::PrincipalOrResourceConstraint::Is(principal_type) => {
                bail!(InvalidPrincipalConstraint::UnexpectedEntityType(
                    ast::EntityType::clone(principal_type)
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
                ast::EntityType::clone(principal_type)
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
                // Organization from cedar (Some(principal))
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

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::PrincipalConstraint {
        match self {
            Self::Public {} => ast::PrincipalConstraint::any(),
            Self::User(user) => user.to_cedar(),
            Self::Organization(organization) => organization.to_cedar(),
        }
    }
}

#[cfg(test)]
#[expect(clippy::panic_in_result_fn, reason = "Assertions in test are expected")]
mod tests {
    use core::error::Error;

    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};

    use super::PrincipalConstraint;
    use crate::test_utils::{check_deserialization_error, check_serialization};

    #[track_caller]
    pub(crate) fn check_principal(
        constraint: &PrincipalConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        check_serialization(constraint, value);

        let cedar_constraint = constraint.to_cedar();
        assert_eq!(cedar_constraint.to_string(), cedar_string.as_ref());
        if !constraint.has_slot() {
            PrincipalConstraint::try_from_cedar(&cedar_constraint)?;
        }
        Ok(())
    }

    #[test]
    fn constraint_public() -> Result<(), Box<dyn Error>> {
        check_principal(
            &PrincipalConstraint::Public {},
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
