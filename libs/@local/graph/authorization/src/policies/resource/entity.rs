use alloc::{borrow::Cow, sync::Arc};
use core::{error::Error, iter, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::Report;
use smol_str::SmolStr;
use type_system::{knowledge::entity::id::EntityUuid, ontology::VersionedUrl, web::OwnedById};
use uuid::Uuid;

use super::entity_type::EntityTypeId;
use crate::policies::cedar::CedarEntityId;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityResource<'a> {
    pub web_id: OwnedById,
    pub id: EntityUuid,
    pub entity_type: Cow<'a, [VersionedUrl]>,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum EntityResourceFilter {
    IsType { entity_type: VersionedUrl },
    IsAllTypes { entity_types: Vec<VersionedUrl> },
    IsAnyType { entity_types: Vec<VersionedUrl> },
}

fn versioned_url_to_euid(url: &VersionedUrl) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(EntityTypeId::entity_type()),
        ast::Eid::new(url.to_string()),
        None,
    )
}

impl EntityResourceFilter {
    #[must_use]
    pub(crate) fn to_cedar(&self) -> ast::Expr {
        match self {
            Self::IsType { entity_type } => ast::Expr::contains(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("entity_types"),
                ),
                ast::Expr::val(versioned_url_to_euid(entity_type)),
            ),
            Self::IsAllTypes { entity_types } => ast::Expr::contains_all(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("entity_types"),
                ),
                ast::Expr::set(
                    entity_types
                        .iter()
                        .map(|url| ast::Expr::val(versioned_url_to_euid(url))),
                ),
            ),
            Self::IsAnyType { entity_types } => ast::Expr::contains_any(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("entity_types"),
                ),
                ast::Expr::set(
                    entity_types
                        .iter()
                        .map(|url| ast::Expr::val(versioned_url_to_euid(url))),
                ),
            ),
        }
    }
}

impl EntityResource<'_> {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            [(
                SmolStr::new_static("entity_types"),
                ast::RestrictedExpr::set(
                    self.entity_type
                        .iter()
                        .map(|url| ast::RestrictedExpr::val(versioned_url_to_euid(url))),
                ),
            )],
            iter::once(self.web_id.to_euid()).collect(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("Entity should be a valid Cedar entity")
    }
}

impl CedarEntityId for EntityUuid {
    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Entity"]));
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
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum EntityResourceConstraint {
    Any {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        filter: Option<EntityResourceFilter>,
    },
    Exact {
        #[serde(deserialize_with = "Option::deserialize")]
        id: Option<EntityUuid>,
    },
    Web {
        #[serde(deserialize_with = "Option::deserialize")]
        web_id: Option<OwnedById>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        filter: Option<EntityResourceFilter>,
    },
}

impl EntityResourceConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Any { .. }
            | Self::Exact { id: Some(_) }
            | Self::Web {
                web_id: Some(_), ..
            } => false,
            Self::Exact { id: None } | Self::Web { web_id: None, .. } => true,
        }
    }

    #[must_use]
    pub(crate) fn to_cedar_resource_constraint(&self) -> (ast::ResourceConstraint, ast::Expr) {
        match self {
            Self::Any { filter } => (
                ast::ResourceConstraint::is_entity_type(Arc::clone(EntityUuid::entity_type())),
                filter
                    .as_ref()
                    .map_or_else(|| ast::Expr::val(true), EntityResourceFilter::to_cedar),
            ),
            Self::Exact { id } => id.map_or_else(
                || (ast::ResourceConstraint::is_eq_slot(), ast::Expr::val(true)),
                |id| {
                    (
                        ast::ResourceConstraint::is_eq(Arc::new(id.to_euid())),
                        ast::Expr::val(true),
                    )
                },
            ),
            Self::Web { web_id, filter } => (
                web_id.map_or_else(
                    || {
                        ast::ResourceConstraint::is_entity_type_in_slot(Arc::clone(
                            EntityUuid::entity_type(),
                        ))
                    },
                    |web_id| {
                        ast::ResourceConstraint::is_entity_type_in(
                            Arc::clone(EntityUuid::entity_type()),
                            Arc::new(web_id.to_euid()),
                        )
                    },
                ),
                filter
                    .as_ref()
                    .map_or_else(|| ast::Expr::val(true), EntityResourceFilter::to_cedar),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::{error::Error, str::FromStr as _};

    use serde_json::json;
    use type_system::{knowledge::entity::id::EntityUuid, ontology::VersionedUrl, web::OwnedById};
    use uuid::Uuid;

    use super::{EntityResourceConstraint, EntityResourceFilter};
    use crate::{
        policies::{ResourceConstraint, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Any { filter: None }),
            json!({
                "type": "entity"
            }),
            "resource is HASH::Entity",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "additional": "unexpected"
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_any_with_filter() -> Result<(), Box<dyn Error>> {
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: Some(EntityResourceFilter::IsType {
                    entity_type: VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/machine/v/1",
                    )?,
                }),
            }),
            json!({
                "type": "entity",
                "filter": {
                    "type": "isType",
                    "entityType": "https://hash.ai/@h/types/entity-type/machine/v/1"
                },
            }),
            "resource is HASH::Entity",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "additional": "unexpected"
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_exact() -> Result<(), Box<dyn Error>> {
        let entity_uuid = EntityUuid::new(Uuid::new_v4());
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Exact {
                id: Some(entity_uuid),
            }),
            json!({
                "type": "entity",
                "id": entity_uuid,
            }),
            format!(r#"resource == HASH::Entity::"{entity_uuid}""#),
        )?;

        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Exact { id: None }),
            json!({
                "type": "entity",
                "id": null,
            }),
            "resource == ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "webId": OwnedById::new(Uuid::new_v4()),
                "id": entity_uuid,
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: Some(web_id),
                filter: None,
            }),
            json!({
                "type": "entity",
                "webId": web_id,
            }),
            format!(r#"resource is HASH::Entity in HASH::Web::"{web_id}""#),
        )?;

        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: None,
                filter: None,
            }),
            json!({
                "type": "entity",
                "webId": null,
            }),
            "resource is HASH::Entity in ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "webId": OwnedById::new(Uuid::new_v4()),
                "id": EntityUuid::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web_with_filter() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: Some(web_id),
                filter: Some(EntityResourceFilter::IsType {
                    entity_type: VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/machine/v/1",
                    )?,
                }),
            }),
            json!({
                "type": "entity",
                "webId": web_id,
                "filter": {
                    "type": "isType",
                    "entityType": "https://hash.ai/@h/types/entity-type/machine/v/1"
                },
            }),
            format!(r#"resource is HASH::Entity in HASH::Web::"{web_id}""#),
        )?;

        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: None,
                filter: Some(EntityResourceFilter::IsType {
                    entity_type: VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/machine/v/1",
                    )?,
                }),
            }),
            json!({
                "type": "entity",
                "webId": null,
                "filter": {
                    "type": "isType",
                    "entityType": "https://hash.ai/@h/types/entity-type/machine/v/1"
                },
            }),
            "resource is HASH::Entity in ?resource",
        )?;

        Ok(())
    }
}
