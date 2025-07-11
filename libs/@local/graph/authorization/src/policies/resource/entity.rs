use alloc::{borrow::Cow, sync::Arc};
use core::{error::Error, iter, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::{Report, ResultExt as _};
use smol_str::SmolStr;
use type_system::{
    knowledge::entity::{EntityId, id::EntityUuid},
    ontology::{BaseUrl, VersionedUrl},
    principal::{actor::ActorId, actor_group::WebId},
};
use uuid::Uuid;

use super::entity_type::EntityTypeId;
use crate::policies::cedar::{
    CedarExpressionParseError, FromCedarEntityId, FromCedarExpr, PolicyExpressionTree,
    ToCedarEntityId, ToCedarExpr, ToCedarRestrictedExpr as _,
};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityResource<'a> {
    pub id: EntityId,
    pub entity_types: Cow<'a, [VersionedUrl]>,
    pub entity_base_types: Cow<'a, [BaseUrl]>,
    pub created_by: ActorId,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum EntityResourceFilter {
    #[serde(rename_all = "camelCase")]
    All { filters: Vec<Self> },
    #[serde(rename_all = "camelCase")]
    Any { filters: Vec<Self> },
    #[serde(rename_all = "camelCase")]
    Not { filter: Box<Self> },
    #[serde(rename_all = "camelCase")]
    IsOfType { entity_type: VersionedUrl },
    #[serde(rename_all = "camelCase")]
    IsOfBaseType { entity_type: BaseUrl },
    #[serde(rename_all = "camelCase")]
    CreatedByPrincipal,
}

#[derive(Debug, derive_more::Display)]
#[display("expression is not supported: {_0:?}")]
pub struct InvalidEntityResourceFilter(PolicyExpressionTree);

impl Error for InvalidEntityResourceFilter {}

impl TryFrom<PolicyExpressionTree> for EntityResourceFilter {
    type Error = Report<InvalidEntityResourceFilter>;

    fn try_from(condition: PolicyExpressionTree) -> Result<Self, Self::Error> {
        match condition {
            PolicyExpressionTree::Not(condition) => Ok(Self::Not {
                filter: Box::new(Self::try_from(*condition)?),
            }),
            PolicyExpressionTree::All(conditions) => Ok(Self::All {
                filters: conditions
                    .into_iter()
                    .map(Self::try_from)
                    .collect::<Result<_, _>>()?,
            }),
            PolicyExpressionTree::Any(conditions) => Ok(Self::Any {
                filters: conditions
                    .into_iter()
                    .map(Self::try_from)
                    .collect::<Result<_, _>>()?,
            }),
            PolicyExpressionTree::IsOfType(entity_type) => Ok(Self::IsOfType { entity_type }),
            PolicyExpressionTree::IsOfBaseType(entity_type) => {
                Ok(Self::IsOfBaseType { entity_type })
            }
            PolicyExpressionTree::CreatedByPrincipal => Ok(Self::CreatedByPrincipal),
            condition @ (PolicyExpressionTree::Is(_)
            | PolicyExpressionTree::In(_)
            | PolicyExpressionTree::BaseUrl(_)
            | PolicyExpressionTree::HasAction(_)
            | PolicyExpressionTree::OntologyTypeVersion(_)) => {
                Err(Report::new(InvalidEntityResourceFilter(condition)))
            }
        }
    }
}

fn versioned_url_to_euid(url: &VersionedUrl) -> ast::EntityUID {
    ast::EntityUID::from_components(
        ast::EntityType::clone(EntityTypeId::entity_type()),
        ast::Eid::new(url.to_string()),
        None,
    )
}

impl ToCedarExpr for EntityResourceFilter {
    fn to_cedar_expr(&self) -> ast::Expr {
        match self {
            Self::All { filters } => filters
                .iter()
                .map(Self::to_cedar_expr)
                .reduce(ast::Expr::and)
                .unwrap_or_else(|| ast::Expr::val(true)),
            Self::Any { filters } => filters
                .iter()
                .map(Self::to_cedar_expr)
                .reduce(ast::Expr::or)
                .unwrap_or_else(|| ast::Expr::val(false)),
            Self::Not { filter } => ast::Expr::not(filter.to_cedar_expr()),

            Self::IsOfType { entity_type } => ast::Expr::contains(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("entity_types"),
                ),
                ast::Expr::val(versioned_url_to_euid(entity_type)),
            ),
            Self::IsOfBaseType { entity_type } => ast::Expr::contains(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("entity_base_types"),
                ),
                ast::Expr::val(entity_type.as_str()),
            ),
            Self::CreatedByPrincipal => ast::Expr::is_eq(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("created_by"),
                ),
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Principal),
                    SmolStr::new_static("id"),
                ),
            ),
        }
    }
}

impl FromCedarExpr for EntityResourceFilter {
    type Error = Report<CedarExpressionParseError>;

    fn from_cedar(expr: &ast::Expr) -> Result<Self, Self::Error> {
        PolicyExpressionTree::from_expr(expr)
            .change_context(CedarExpressionParseError::ParseError)?
            .try_into()
            .change_context(CedarExpressionParseError::ParseError)
    }
}

impl EntityResource<'_> {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.entity_uuid.to_euid(),
            [
                (
                    SmolStr::new_static("entity_types"),
                    ast::RestrictedExpr::set(
                        self.entity_types
                            .iter()
                            .map(|url| ast::RestrictedExpr::val(versioned_url_to_euid(url))),
                    ),
                ),
                (
                    SmolStr::new_static("entity_base_types"),
                    ast::RestrictedExpr::set(
                        self.entity_base_types
                            .iter()
                            .map(|url| ast::RestrictedExpr::val(url.as_str())),
                    ),
                ),
                (
                    SmolStr::new_static("created_by"),
                    self.created_by.to_cedar_restricted_expr(),
                ),
            ],
            HashSet::new(),
            iter::once(self.id.web_id.to_euid()).collect(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("Entity should be a valid Cedar entity")
    }
}

impl FromCedarEntityId for EntityUuid {
    type Error = Report<uuid::Error>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["Entity"]));
        &ENTITY_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(Uuid::from_str(eid.as_ref())?))
    }
}

impl ToCedarEntityId for EntityUuid {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        Self::entity_type()
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.to_string())
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(untagged, deny_unknown_fields)]
pub enum EntityResourceConstraint {
    #[serde(rename_all = "camelCase")]
    Any { filter: EntityResourceFilter },
    #[serde(rename_all = "camelCase")]
    Exact { id: EntityUuid },
    #[serde(rename_all = "camelCase")]
    Web {
        web_id: WebId,
        filter: EntityResourceFilter,
    },
}

impl EntityResourceConstraint {
    #[must_use]
    pub(crate) fn to_cedar_resource_constraint(&self) -> (ast::ResourceConstraint, ast::Expr) {
        match self {
            Self::Any { filter } => (
                ast::ResourceConstraint::is_entity_type(Arc::clone(EntityUuid::entity_type())),
                filter.to_cedar_expr(),
            ),
            Self::Exact { id } => (
                ast::ResourceConstraint::is_eq(Arc::new(id.to_euid())),
                ast::Expr::val(true),
            ),
            Self::Web { web_id, filter } => (
                ast::ResourceConstraint::is_entity_type_in(
                    Arc::clone(EntityUuid::entity_type()),
                    Arc::new(web_id.to_euid()),
                ),
                filter.to_cedar_expr(),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::{error::Error, str::FromStr as _};

    use serde_json::json;
    use type_system::{
        knowledge::entity::id::EntityUuid, ontology::VersionedUrl, principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{EntityResourceConstraint, EntityResourceFilter};
    use crate::{
        policies::{ResourceConstraint, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::All { filters: vec![] },
            })),
            json!({
                "type": "entity",
                "filter": {
                    "type": "all",
                    "filters": [],
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
    fn constraint_any_with_filter() -> Result<(), Box<dyn Error>> {
        check_resource(
            Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::IsOfType {
                    entity_type: VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/machine/v/1",
                    )?,
                },
            })),
            json!({
                "type": "entity",
                "filter": {
                    "type": "isOfType",
                    "entityType": "https://hash.ai/@h/types/entity-type/machine/v/1"
                },
            }),
            "resource is HASH::Entity",
        )?;

        check_resource(
            Some(ResourceConstraint::Entity(EntityResourceConstraint::Any {
                filter: EntityResourceFilter::CreatedByPrincipal,
            })),
            json!({
                "type": "entity",
                "filter": {
                    "type": "createdByPrincipal",
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
            Some(ResourceConstraint::Entity(
                EntityResourceConstraint::Exact { id: entity_uuid },
            )),
            json!({
                "type": "entity",
                "id": entity_uuid,
            }),
            format!(r#"resource == HASH::Entity::"{entity_uuid}""#),
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "webId": WebId::new(Uuid::new_v4()),
                "id": entity_uuid,
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = WebId::new(Uuid::new_v4());
        check_resource(
            Some(ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id,
                filter: EntityResourceFilter::All { filters: vec![] },
            })),
            json!({
                "type": "entity",
                "webId": web_id,
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            format!(r#"resource is HASH::Entity in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entity",
                "webId": WebId::new(Uuid::new_v4()),
                "id": EntityUuid::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum EntityResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web_with_filter() -> Result<(), Box<dyn Error>> {
        let web_id = WebId::new(Uuid::new_v4());
        check_resource(
            Some(ResourceConstraint::Entity(EntityResourceConstraint::Web {
                web_id,
                filter: EntityResourceFilter::IsOfType {
                    entity_type: VersionedUrl::from_str(
                        "https://hash.ai/@h/types/entity-type/machine/v/1",
                    )?,
                },
            })),
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

        Ok(())
    }
}
