use alloc::{borrow::Cow, sync::Arc};
use core::{error::Error, fmt, iter, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::{Report, ResultExt as _};
use smol_str::SmolStr;
use type_system::{
    ontology::id::{BaseUrl, OntologyTypeVersion, ParseVersionedUrlError, VersionedUrl},
    web::OwnedById,
};

use crate::policies::cedar::{
    CedarEntityId, CedarExpressionParseError, FromCedarExpr, PolicyExpressionTree, ToCedarExpr,
};

#[derive(
    Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct EntityTypeId(VersionedUrl);

impl EntityTypeId {
    #[must_use]
    pub const fn new(url: VersionedUrl) -> Self {
        Self(url)
    }

    #[must_use]
    pub fn into_url(self) -> VersionedUrl {
        self.0
    }

    #[must_use]
    pub const fn as_url(&self) -> &VersionedUrl {
        &self.0
    }
}

impl fmt::Display for EntityTypeId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Debug)]
pub struct EntityTypeResource<'a> {
    pub web_id: OwnedById,
    pub id: Cow<'a, EntityTypeId>,
}

impl EntityTypeResource<'_> {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        ast::Entity::new(
            self.id.to_euid(),
            [
                (
                    SmolStr::new_static("base_url"),
                    ast::RestrictedExpr::val(self.id.as_url().base_url.to_string()),
                ),
                (
                    SmolStr::new_static("version"),
                    ast::RestrictedExpr::val(i64::from(self.id.as_url().version.inner())),
                ),
            ],
            iter::once(self.web_id.to_euid()).collect(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("Entity type should be a valid Cedar entity")
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum EntityTypeResourceFilter {
    All { filters: Vec<Self> },
    Any { filters: Vec<Self> },
    Not { filter: Box<Self> },
    IsBaseUrl { base_url: BaseUrl },
    IsVersion { version: OntologyTypeVersion },
}

#[derive(Debug, derive_more::Display)]
#[display("expression is not supported: {_0:?}")]
pub struct InvalidEntityTypeResourceFilter(PolicyExpressionTree);

impl Error for InvalidEntityTypeResourceFilter {}

impl TryFrom<PolicyExpressionTree> for EntityTypeResourceFilter {
    type Error = Report<InvalidEntityTypeResourceFilter>;

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
            PolicyExpressionTree::BaseUrl(base_url) => Ok(Self::IsBaseUrl { base_url }),
            PolicyExpressionTree::OntologyTypeVersion(version) => Ok(Self::IsVersion { version }),
            condition => Err(Report::new(InvalidEntityTypeResourceFilter(condition))),
        }
    }
}

impl ToCedarExpr for EntityTypeResourceFilter {
    fn to_cedar(&self) -> ast::Expr {
        match self {
            Self::All { filters } => filters
                .iter()
                .map(Self::to_cedar)
                .reduce(ast::Expr::and)
                .unwrap_or_else(|| ast::Expr::val(true)),
            Self::Any { filters } => filters
                .iter()
                .map(Self::to_cedar)
                .reduce(ast::Expr::or)
                .unwrap_or_else(|| ast::Expr::val(false)),
            Self::Not { filter } => ast::Expr::not(filter.to_cedar()),
            Self::IsBaseUrl { base_url } => ast::Expr::is_eq(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("base_url"),
                ),
                ast::Expr::val(base_url.to_string()),
            ),
            Self::IsVersion { version } => ast::Expr::is_eq(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("version"),
                ),
                ast::Expr::val(version.inner().to_string()),
            ),
        }
    }
}

impl FromCedarExpr for EntityTypeResourceFilter {
    type Error = Report<CedarExpressionParseError>;

    fn from_cedar(expr: &ast::Expr) -> Result<Self, Self::Error> {
        PolicyExpressionTree::from_expr(expr)
            .change_context(CedarExpressionParseError::ParseError)?
            .try_into()
            .change_context(CedarExpressionParseError::ParseError)
    }
}

impl CedarEntityId for EntityTypeId {
    type Error = Report<ParseVersionedUrlError>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static ENTITY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["EntityType"]));
        &ENTITY_TYPE
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.as_url().to_string())
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(VersionedUrl::from_str(eid.as_ref())?))
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(untagged, rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum EntityTypeResourceConstraint {
    Any {
        filter: EntityTypeResourceFilter,
    },
    Exact {
        #[serde(deserialize_with = "Option::deserialize")]
        id: Option<EntityTypeId>,
    },
    Web {
        #[serde(deserialize_with = "Option::deserialize")]
        web_id: Option<OwnedById>,
        filter: EntityTypeResourceFilter,
    },
}

#[derive(Debug)]
pub enum EntityTypeResourceConstraints {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    IsBaseUrl(BaseUrl),
    IsVersion(OntologyTypeVersion),
    IsEntityType(VersionedUrl),
    InWeb(OwnedById),
}

impl EntityTypeResourceConstraint {
    #[must_use]
    pub const fn has_slot(&self) -> bool {
        match self {
            Self::Any { filter: _ }
            | Self::Exact { id: Some(_) }
            | Self::Web {
                web_id: Some(_),
                filter: _,
            } => false,
            Self::Exact { id: None }
            | Self::Web {
                web_id: None,
                filter: _,
            } => true,
        }
    }

    #[must_use]
    pub(crate) fn to_cedar(&self) -> (ast::ResourceConstraint, ast::Expr) {
        match self {
            Self::Any { filter } => (
                ast::ResourceConstraint::is_entity_type(Arc::clone(EntityTypeId::entity_type())),
                filter.to_cedar(),
            ),
            Self::Exact { id } => (
                id.as_ref()
                    .map_or_else(ast::ResourceConstraint::is_eq_slot, |id| {
                        ast::ResourceConstraint::is_eq(Arc::new(id.to_euid()))
                    }),
                ast::Expr::val(true),
            ),
            Self::Web { web_id, filter } => (
                web_id.map_or_else(
                    || {
                        ast::ResourceConstraint::is_entity_type_in_slot(Arc::clone(
                            EntityTypeId::entity_type(),
                        ))
                    },
                    |web_id| {
                        ast::ResourceConstraint::is_entity_type_in(
                            Arc::clone(EntityTypeId::entity_type()),
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

    use super::{EntityTypeId, EntityTypeResourceConstraint, EntityTypeResourceFilter};
    use crate::{
        policies::{ResourceConstraint, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Any {
                filter: EntityTypeResourceFilter::All { filters: vec![] },
            }),
            json!({
                "type": "entityType",
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            "resource is HASH::EntityType",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entityType",
                "additional": "unexpected"
            }),
            "data did not match any variant of untagged enum EntityTypeResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_exact() -> Result<(), Box<dyn Error>> {
        let entity_type_id = EntityTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@hash/types/entity-type/user/v/1",
        )?);

        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Exact {
                id: Some(entity_type_id.clone()),
            }),
            json!({
                "type": "entityType",
                "id": entity_type_id,
            }),
            format!(r#"resource == HASH::EntityType::"{entity_type_id}""#),
        )?;

        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Exact { id: None }),
            json!({
                "type": "entityType",
                "id": null,
            }),
            "resource == ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entityType",
                "webId": OwnedById::new(Uuid::new_v4()),
                "id": entity_type_id,
            }),
            "data did not match any variant of untagged enum EntityTypeResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Web {
                web_id: Some(web_id),
                filter: EntityTypeResourceFilter::All { filters: vec![] },
            }),
            json!({
                "type": "entityType",
                "webId": web_id,
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            format!(r#"resource is HASH::EntityType in HASH::Web::"{web_id}""#),
        )?;

        check_resource(
            ResourceConstraint::EntityType(EntityTypeResourceConstraint::Web {
                web_id: None,
                filter: EntityTypeResourceFilter::All { filters: vec![] },
            }),
            json!({
                "type": "entityType",
                "webId": null,
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            "resource is HASH::EntityType in ?resource",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "entityType",
                "webId": OwnedById::new(Uuid::new_v4()),
                "id": EntityUuid::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum EntityTypeResourceConstraint",
        )?;

        Ok(())
    }
}
