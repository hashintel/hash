#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

use alloc::sync::Arc;
use core::{error::Error, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, bail};
use uuid::Uuid;

pub use self::entity::EntityResourceConstraint;
use crate::policies::cedar::CedarEntityId;
mod entity;

use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};

impl CedarEntityId for OwnedById {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Web"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ResourceConstraint {
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "Serialization is different"
    )]
    Global {},
    Web {
        #[serde(deserialize_with = "Option::deserialize")]
        web_id: Option<OwnedById>,
    },
    Entity(EntityResourceConstraint),
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum InvalidResourceConstraint {
    #[display("Cannot convert constraints containing slots")]
    AmbiguousSlot,
    #[error(ignore)]
    #[display("Unexpected entity type: {_0}")]
    UnexpectedEntityType(ast::EntityType),
    #[display("Invalid resource ID")]
    InvalidPrincipalId,
}

impl ResourceConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Global {} | Self::Web { web_id: Some(_) } => false,
            Self::Web { web_id: None } => true,
            Self::Entity(entity) => entity.has_slot(),
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::ResourceConstraint {
        match self {
            Self::Global {} => ast::ResourceConstraint::any(),
            Self::Web { web_id } => web_id
                .map_or_else(ast::ResourceConstraint::is_in_slot, |web_id| {
                    ast::ResourceConstraint::is_in(Arc::new(web_id.to_euid()))
                }),
            Self::Entity(entity) => entity.to_cedar(),
        }
    }

    pub(crate) fn try_from_cedar(
        constraint: &ast::ResourceConstraint,
    ) -> Result<Self, Report<InvalidResourceConstraint>> {
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
                ast::EntityType::clone(resource_type)
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

#[cfg(test)]
#[expect(clippy::panic_in_result_fn, reason = "Assertions in test are expected")]
mod tests {
    use core::error::Error;

    use hash_graph_types::owned_by_id::OwnedById;
    use pretty_assertions::assert_eq;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use super::ResourceConstraint;
    use crate::test_utils::{check_deserialization_error, check_serialization};

    #[track_caller]
    pub(crate) fn check_resource(
        constraint: &ResourceConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        check_serialization(constraint, value);

        let cedar_constraint = constraint.to_cedar();
        assert_eq!(cedar_constraint.to_string(), cedar_string.as_ref());
        if !constraint.has_slot() {
            ResourceConstraint::try_from_cedar(&cedar_constraint)?;
        }

        Ok(())
    }

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            &ResourceConstraint::Global {},
            json!({
                "type": "global",
            }),
            "resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "global",
                "additional": "unexpected"
            }),
            "unknown field `additional`, there are no fields",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_resource(
            &ResourceConstraint::Web {
                web_id: Some(web_id),
            },
            json!({
                "type": "web",
                "webId": web_id,
            }),
            format!(r#"resource in HASH::Web::"{web_id}""#),
        )?;

        check_resource(
            &ResourceConstraint::Web { web_id: None },
            json!({
                "type": "web",
                "webId": null,
            }),
            "resource in ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "web",
            }),
            "missing field `webId`",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "web",
                "webId": web_id,
                "additional": "unexpected",
            }),
            "unknown field `additional`, expected `webId`",
        )?;

        Ok(())
    }
}
