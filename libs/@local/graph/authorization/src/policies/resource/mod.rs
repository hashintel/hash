#![expect(
    clippy::empty_enum,
    reason = "serde::Deseiriealize does not use the never-type"
)]

mod entity;
mod entity_type;

use alloc::{borrow::Cow, sync::Arc};
use core::str::FromStr as _;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, bail};
use type_system::{knowledge::entity::id::EntityUuid, ontology::VersionedUrl, web::OwnedById};
use uuid::Uuid;

pub use self::{
    entity::{EntityResource, EntityResourceConstraint, EntityResourceFilter},
    entity_type::{
        EntityTypeId, EntityTypeResource, EntityTypeResourceConstraint, EntityTypeResourceFilter,
    },
};
use crate::policies::cedar::CedarEntityId as _;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResourceId<'a> {
    Entity(EntityUuid),
    EntityType(Cow<'a, EntityTypeId>),
}

impl ResourceId<'_> {
    pub(crate) fn to_euid(&self) -> ast::EntityUID {
        match self {
            Self::Entity(id) => id.to_euid(),
            Self::EntityType(id) => id.to_euid(),
        }
    }
}

#[derive(Debug)]
pub enum Resource<'a> {
    Entity(EntityResource<'a>),
    EntityType(EntityTypeResource<'a>),
}

impl Resource<'_> {
    #[must_use]
    pub const fn id(&self) -> ResourceId<'_> {
        match self {
            Self::Entity(entity) => ResourceId::Entity(entity.id),
            Self::EntityType(entity_type) => ResourceId::EntityType(match &entity_type.id {
                Cow::Borrowed(id) => Cow::Borrowed(*id),
                Cow::Owned(id) => Cow::Borrowed(id),
            }),
        }
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
    EntityType(EntityTypeResourceConstraint),
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
            Self::EntityType(entity_type) => entity_type.has_slot(),
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> (ast::ResourceConstraint, ast::Expr<()>) {
        match self {
            Self::Global {} => (ast::ResourceConstraint::any(), ast::Expr::val(true)),
            Self::Web { web_id } => (
                web_id.map_or_else(ast::ResourceConstraint::is_in_slot, |web_id| {
                    ast::ResourceConstraint::is_in(Arc::new(web_id.to_euid()))
                }),
                ast::Expr::val(true),
            ),
            Self::Entity(entity) => entity.to_cedar_resource_constraint(),
            Self::EntityType(entity_type) => entity_type.to_cedar(),
        }
    }

    pub(crate) fn try_from_cedar(
        constraint: &ast::ResourceConstraint,
    ) -> Result<Self, Report<InvalidResourceConstraint>> {
        match constraint.as_inner() {
            ast::PrincipalOrResourceConstraint::Any => Ok(Self::Global {}),
            ast::PrincipalOrResourceConstraint::Is(resource_type) => {
                Self::try_from_cedar_is_in(resource_type, None)
            }
            ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::EUID(resource)) => {
                Self::try_from_cedar_eq(resource)
            }
            ast::PrincipalOrResourceConstraint::In(ast::EntityReference::EUID(resource)) => {
                Self::try_from_cedar_in(resource)
            }
            ast::PrincipalOrResourceConstraint::IsIn(
                resource_type,
                ast::EntityReference::EUID(resource),
            ) => Self::try_from_cedar_is_in(resource_type, Some(resource)),
            ast::PrincipalOrResourceConstraint::IsIn(_, ast::EntityReference::Slot(_))
            | ast::PrincipalOrResourceConstraint::Eq(ast::EntityReference::Slot(_))
            | ast::PrincipalOrResourceConstraint::In(ast::EntityReference::Slot(_)) => {
                bail!(InvalidResourceConstraint::AmbiguousSlot)
            }
        }
    }

    fn try_from_cedar_eq(
        resource: &ast::EntityUID,
    ) -> Result<Self, Report<InvalidResourceConstraint>> {
        if *resource.entity_type() == **EntityUuid::entity_type() {
            Ok(Self::Entity(EntityResourceConstraint::Exact {
                id: Some(EntityUuid::new(
                    Uuid::from_str(resource.eid().as_ref())
                        .change_context(InvalidResourceConstraint::InvalidPrincipalId)?,
                )),
            }))
        } else if *resource.entity_type() == **EntityTypeId::entity_type() {
            Ok(Self::EntityType(EntityTypeResourceConstraint::Exact {
                id: Some(EntityTypeId::new(
                    VersionedUrl::from_str(resource.eid().as_ref())
                        .change_context(InvalidResourceConstraint::InvalidPrincipalId)?,
                )),
            }))
        } else {
            bail!(InvalidResourceConstraint::UnexpectedEntityType(
                resource.entity_type().clone()
            ))
        }
    }

    fn try_from_cedar_in(
        resource: &ast::EntityUID,
    ) -> Result<Self, Report<InvalidResourceConstraint>> {
        if *resource.entity_type() == **OwnedById::entity_type() {
            Ok(Self::Web {
                web_id: Some(OwnedById::new(
                    Uuid::from_str(resource.eid().as_ref())
                        .change_context(InvalidResourceConstraint::InvalidPrincipalId)?,
                )),
            })
        } else {
            bail!(InvalidResourceConstraint::UnexpectedEntityType(
                ast::EntityType::clone(resource.entity_type())
            ))
        }
    }

    fn try_from_cedar_is_in(
        resource_type: &ast::EntityType,
        in_resource: Option<&ast::EntityUID>,
    ) -> Result<Self, Report<InvalidResourceConstraint>> {
        if *resource_type == **EntityUuid::entity_type() {
            let Some(in_resource) = in_resource else {
                return Ok(Self::Entity(EntityResourceConstraint::Any { filter: None }));
            };

            if *in_resource.entity_type() == **OwnedById::entity_type() {
                Ok(Self::Entity(EntityResourceConstraint::Web {
                    web_id: Some(OwnedById::new(
                        Uuid::from_str(in_resource.eid().as_ref())
                            .change_context(InvalidResourceConstraint::InvalidPrincipalId)?,
                    )),
                    filter: None,
                }))
            } else {
                bail!(InvalidResourceConstraint::UnexpectedEntityType(
                    in_resource.entity_type().clone()
                ))
            }
        } else if *resource_type == **EntityTypeId::entity_type() {
            let Some(in_resource) = in_resource else {
                return Ok(Self::EntityType(EntityTypeResourceConstraint::Any {
                    filter: None,
                }));
            };

            if *in_resource.entity_type() == **OwnedById::entity_type() {
                Ok(Self::EntityType(EntityTypeResourceConstraint::Web {
                    web_id: Some(OwnedById::new(
                        Uuid::from_str(in_resource.eid().as_ref())
                            .change_context(InvalidResourceConstraint::InvalidPrincipalId)?,
                    )),
                    filter: None,
                }))
            } else {
                bail!(InvalidResourceConstraint::UnexpectedEntityType(
                    in_resource.entity_type().clone()
                ))
            }
        } else {
            bail!(InvalidResourceConstraint::UnexpectedEntityType(
                resource_type.clone()
            ))
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
    use type_system::web::OwnedById;
    use uuid::Uuid;

    use super::ResourceConstraint;
    use crate::{
        policies::{
            Effect, Policy, PolicyId, action::ActionConstraint, principal::PrincipalConstraint,
            tests::check_policy,
        },
        test_utils::{check_deserialization_error, check_serialization},
    };

    #[track_caller]
    pub(crate) fn check_resource(
        constraint: ResourceConstraint,
        value: JsonValue,
        cedar_string: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>> {
        let (cedar_constraint, resource_expr) = constraint.to_cedar();
        let cedar_string = cedar_string.as_ref();

        assert_eq!(cedar_constraint.to_string(), cedar_string);
        if !constraint.has_slot() {
            ResourceConstraint::try_from_cedar(&cedar_constraint)?;
        }

        let policy = Policy {
            id: PolicyId::new(Uuid::new_v4()),
            effect: Effect::Permit,
            principal: PrincipalConstraint::Public {},
            action: ActionConstraint::All {},
            resource: constraint,
            constraints: None,
        };

        check_policy(
            &policy,
            json!({
                "id": policy.id,
                "effect": "permit",
                "principal": {
                    "type": "public",
                },
                "action": {
                    "type": "all",
                },
                "resource": &value,
            }),
            formatdoc!(
                "permit(
                  principal,
                  action,
                  {cedar_string}
                ) when {{
                  {resource_expr}
                }};"
            ),
        )?;

        check_serialization(&policy.resource, value);

        Ok(())
    }

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            ResourceConstraint::Global {},
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
            ResourceConstraint::Web {
                web_id: Some(web_id),
            },
            json!({
                "type": "web",
                "webId": web_id,
            }),
            format!(r#"resource in HASH::Web::"{web_id}""#),
        )?;

        check_resource(
            ResourceConstraint::Web { web_id: None },
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
