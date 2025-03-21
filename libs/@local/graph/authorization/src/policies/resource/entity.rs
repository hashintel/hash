use alloc::{borrow::Cow, sync::Arc};
use core::{error::Error, fmt, iter, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::{Report, ResultExt as _, bail};
use smol_str::SmolStr;
use type_system::{knowledge::entity::id::EntityUuid, ontology::VersionedUrl, web::OwnedById};
use uuid::Uuid;

use super::{ResourceFilterConversionError, entity_type::EntityTypeId};
use crate::policies::{
    cedar::{
        CedarEntityId, CedarExpressionParseError, CedarExpressionVisitor, EntityTypeIdVisitor,
        FromCedarExpr, ToCedarExpr, UnexpectedCedarExpression,
    },
    resource::ResourceVariableVisitor,
};

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
    All { filters: Vec<Self> },
    Any { filters: Vec<Self> },
    Not { filter: Box<Self> },

    IsOfType { entity_type: VersionedUrl },
}

fn versioned_url_to_euid(url: &VersionedUrl) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(EntityTypeId::entity_type()),
        ast::Eid::new(url.to_string()),
        None,
    )
}

// New code for extensible entity attribute parsing
#[derive(Debug, Clone, PartialEq, Eq)]
enum EntityAttribute {
    EntityTypes,
    // Other attributes can be added here in the future
}

struct AttributeVisitor;

impl CedarExpressionVisitor for AttributeVisitor {
    type Value = EntityAttribute;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "an entity attribute expression")
    }

    fn visit_get_attr(
        &self,
        expr: &ast::Expr,
        attr: &str,
    ) -> Result<Self::Value, Report<CedarExpressionParseError>> {
        ResourceVariableVisitor.visit_expr(expr)?;

        match attr {
            "entity_types" => Ok(EntityAttribute::EntityTypes),
            attr => bail!(CedarExpressionParseError::unexpected_expr_err(
                self,
                UnexpectedCedarExpression::GetAttr(expr.clone(), attr.to_owned())
            )),
        }
    }
}

struct EntityFilterVisitor;

impl CedarExpressionVisitor for EntityFilterVisitor {
    type Value = EntityResourceFilter;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "an entity resource filter expression")
    }

    fn visit_contains(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<CedarExpressionParseError>> {
        match AttributeVisitor.visit_expr(lhs)? {
            EntityAttribute::EntityTypes => Ok(EntityResourceFilter::IsOfType {
                entity_type: EntityTypeIdVisitor.visit_expr(rhs)?,
            }),
        }
    }

    fn visit_bool(&self, bool: bool) -> Result<Self::Value, Report<CedarExpressionParseError>> {
        if bool {
            Ok(EntityResourceFilter::All {
                filters: Vec::new(),
            })
        } else {
            Ok(EntityResourceFilter::Any {
                filters: Vec::new(),
            })
        }
    }

    fn visit_and(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<CedarExpressionParseError>> {
        let mut all_filters = Vec::new();

        match self.visit_expr(lhs)? {
            EntityResourceFilter::All { filters } => all_filters.extend(filters),
            constraint => all_filters.push(constraint),
        }
        match self.visit_expr(rhs)? {
            EntityResourceFilter::All { filters } => all_filters.extend(filters),
            constraint => all_filters.push(constraint),
        }

        if all_filters.len() == 1 {
            Ok(all_filters.pop().expect("should have exactly one filter"))
        } else {
            Ok(EntityResourceFilter::All {
                filters: all_filters,
            })
        }
    }

    fn visit_or(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<CedarExpressionParseError>> {
        let mut any_filters = Vec::new();

        match self.visit_expr(lhs)? {
            EntityResourceFilter::Any { filters } => any_filters.extend(filters),
            constraint => any_filters.push(constraint),
        }
        match self.visit_expr(rhs)? {
            EntityResourceFilter::Any { filters } => any_filters.extend(filters),
            constraint => any_filters.push(constraint),
        }

        if any_filters.len() == 1 {
            Ok(any_filters.pop().expect("should have exactly one filter"))
        } else {
            Ok(EntityResourceFilter::Any {
                filters: any_filters,
            })
        }
    }

    fn visit_not(&self, arg: &ast::Expr) -> Result<Self::Value, Report<CedarExpressionParseError>> {
        Ok(EntityResourceFilter::Not {
            filter: Box::new(self.visit_expr(arg)?),
        })
    }
}

impl ToCedarExpr for EntityResourceFilter {
    fn to_cedar(&self) -> ast::Expr {
        match self {
            Self::All { filters } => {
                filters
                    .iter()
                    .map(Self::to_cedar)
                    .reduce(ast::Expr::and)
                    .unwrap_or_else(|| ast::Expr::val(true))
                // }
            }
            Self::Any { filters } => {
                filters
                    .iter()
                    .map(Self::to_cedar)
                    .reduce(ast::Expr::or)
                    .unwrap_or_else(|| ast::Expr::val(false))
                // }
            }
            Self::Not { filter } => ast::Expr::not(filter.to_cedar()),

            Self::IsOfType { entity_type } => ast::Expr::contains(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("entity_types"),
                ),
                ast::Expr::val(versioned_url_to_euid(entity_type)),
            ),
        }
    }
}

impl FromCedarExpr for EntityResourceFilter {
    fn from_cedar(expr: &ast::Expr) -> Result<Self, Report<impl Error + Send + Sync + 'static>> {
        EntityFilterVisitor
            .visit_expr(expr)
            .change_context(ResourceFilterConversionError)
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
        filter: EntityResourceFilter,
    },
    Exact {
        #[serde(deserialize_with = "Option::deserialize")]
        id: Option<EntityUuid>,
    },
    Web {
        #[serde(deserialize_with = "Option::deserialize")]
        web_id: Option<OwnedById>,
        filter: EntityResourceFilter,
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
                filter.to_cedar(),
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
                filter.to_cedar(),
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
        policies::{ResourceConstraint, cedar::ToCedarExpr, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::All { filters: vec![] },
            }),
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
                filter: EntityResourceFilter::IsOfType {
                    entity_type: VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/machine/v/1",
                    )?,
                },
            }),
            json!({
                "type": "entity",
                "filter": {
                    "type": "isOfType",
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
                filter: EntityResourceFilter::All { filters: vec![] },
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
                filter: EntityResourceFilter::All { filters: vec![] },
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
                filter: EntityResourceFilter::IsOfType {
                    entity_type: VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/machine/v/1",
                    )?,
                },
            }),
            json!({
                "type": "entity",
                "webId": web_id,
                "filter": {
                    "type": "isOfType",
                    "entityType": "https://hash.ai/@h/types/entity-type/machine/v/1"
                },
            }),
            format!(r#"resource is HASH::Entity in HASH::Web::"{web_id}""#),
        )?;

        check_resource(
            ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id: None,
                filter: EntityResourceFilter::IsOfType {
                    entity_type: VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/machine/v/1",
                    )?,
                },
            }),
            json!({
                "type": "entity",
                "webId": null,
                "filter": {
                    "type": "isOfType",
                    "entityType": "https://hash.ai/@h/types/entity-type/machine/v/1"
                },
            }),
            "resource is HASH::Entity in ?resource",
        )?;

        Ok(())
    }
}
