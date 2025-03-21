use alloc::{borrow::Cow, sync::Arc};
use core::{fmt, iter, str::FromStr as _};
use std::sync::LazyLock;

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::{Report, ResultExt as _};
use smol_str::SmolStr;
use type_system::{
    ontology::id::{BaseUrl, OntologyTypeVersion, ParseVersionedUrlError, VersionedUrl},
    web::OwnedById,
};

use super::ResourceVariableVisitor;
use crate::policies::cedar::{
    BaseUrlVisitor, CedarEntityId, CedarExpressionParseError, CedarExpressionParser as _,
    CedarExpressionVisitor, EntityTypeIdVisitor, FromCedarExpr, OntologyTypeVersionVisitor,
    SimpleParser, ToCedarExpr, WebIdVisitor,
    visitor_helpers::{self, ComposableValue},
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

impl ComposableValue for EntityTypeResourceFilter {
    fn make_all(filters: Vec<Self>) -> Self {
        Self::All { filters }
    }

    fn make_any(filters: Vec<Self>) -> Self {
        Self::Any { filters }
    }

    fn make_not(filter: Self) -> Self {
        Self::Not {
            filter: Box::new(filter),
        }
    }

    fn extend_all(filters: &mut Vec<Self>, filter: Self) {
        match filter {
            Self::All { filters: f } => filters.extend(f),
            constraint => filters.push(constraint),
        }
    }

    fn extend_any(filters: &mut Vec<Self>, filter: Self) {
        match filter {
            Self::Any { filters: f } => filters.extend(f),
            constraint => filters.push(constraint),
        }
    }
}

// New code for extensible entity attribute parsing
#[derive(Debug, Clone, PartialEq, Eq)]
enum EntityTypeAttribute {
    BaseUrl,
    Version,
}
struct EntityTypeFilterVisitor;

impl CedarExpressionVisitor for EntityTypeFilterVisitor {
    type Error = Report<CedarExpressionParseError>;
    type Value = EntityTypeResourceFilter;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "an entity type resource filter expression")
    }

    fn visit_bool(
        &self,
        bool: bool,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        Some(Ok(visitor_helpers::visit_bool(bool)))
    }

    fn visit_and(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        visitor_helpers::visit_and(self, lhs, rhs)
    }

    fn visit_or(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        visitor_helpers::visit_or(self, lhs, rhs)
    }

    fn visit_not(
        &self,
        arg: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        visitor_helpers::visit_not(self, arg)
    }

    fn visit_eq(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                let Ok(()) = ResourceVariableVisitor.visit_expr(expr)?;
                match attr.as_str() {
                    "base_url" => Some(
                        BaseUrlVisitor
                            .visit_expr(rhs)?
                            .change_context(CedarExpressionParseError::ParseError)
                            .map(|base_url| EntityTypeResourceFilter::IsBaseUrl { base_url }),
                    ),
                    "version" => Some(
                        OntologyTypeVersionVisitor
                            .visit_expr(rhs)?
                            .change_context(CedarExpressionParseError::ParseError)
                            .map(|version| EntityTypeResourceFilter::IsVersion { version }),
                    ),
                    _ => None,
                }
            }
            _ => None,
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
        SimpleParser.parse_expr(expr, &EntityTypeFilterVisitor)
    }
}

#[expect(refining_impl_trait)]
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

struct EntityTypeResourceConstraintVisitor;

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

impl ComposableValue for EntityTypeResourceConstraints {
    fn make_all(filters: Vec<Self>) -> Self {
        Self::All(filters)
    }

    fn make_any(filters: Vec<Self>) -> Self {
        Self::Any(filters)
    }

    fn make_not(filter: Self) -> Self {
        Self::Not(Box::new(filter))
    }

    fn extend_all(filters: &mut Vec<Self>, filter: Self) {
        match filter {
            Self::All(f) => filters.extend(f),
            constraint => filters.push(constraint),
        }
    }

    fn extend_any(filters: &mut Vec<Self>, filter: Self) {
        match filter {
            Self::Any(f) => filters.extend(f),
            constraint => filters.push(constraint),
        }
    }
}

impl CedarExpressionVisitor for EntityTypeResourceConstraintVisitor {
    type Error = Report<CedarExpressionParseError>;
    type Value = EntityTypeResourceConstraints;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "an entity type resource constraint expression")
    }

    fn visit_bool(
        &self,
        bool: bool,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        Some(Ok(visitor_helpers::visit_bool(bool)))
    }

    fn visit_and(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        visitor_helpers::visit_and(self, lhs, rhs)
    }

    fn visit_or(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        visitor_helpers::visit_or(self, lhs, rhs)
    }

    fn visit_not(
        &self,
        arg: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        visitor_helpers::visit_not(self, arg)
    }

    fn visit_eq(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        if ResourceVariableVisitor.visit_expr(lhs).is_some() {
            return Some(
                EntityTypeIdVisitor
                    .visit_expr(rhs)?
                    .change_context(CedarExpressionParseError::ParseError)
                    .map(EntityTypeResourceConstraints::IsEntityType),
            );
        }

        match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                let Ok(()) = ResourceVariableVisitor.visit_expr(expr)?;
                match attr.as_str() {
                    "base_url" => Some(
                        BaseUrlVisitor
                            .visit_expr(rhs)?
                            .change_context(CedarExpressionParseError::ParseError)
                            .map(EntityTypeResourceConstraints::IsBaseUrl),
                    ),
                    "version" => Some(
                        OntologyTypeVersionVisitor
                            .visit_expr(rhs)?
                            .change_context(CedarExpressionParseError::ParseError)
                            .map(EntityTypeResourceConstraints::IsVersion),
                    ),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    fn visit_in(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Option<Result<Self::Value, Report<CedarExpressionParseError>>> {
        let Ok(()) = ResourceVariableVisitor.visit_expr(lhs)?;
        Some(
            WebIdVisitor
                .visit_expr(rhs)?
                .change_context(CedarExpressionParseError::ParseError)
                .map(EntityTypeResourceConstraints::InWeb),
        )
    }
}

impl FromCedarExpr for EntityTypeResourceConstraints {
    type Error = Report<CedarExpressionParseError>;

    fn from_cedar(expr: &ast::Expr) -> Result<Self, Self::Error> {
        SimpleParser.parse_expr(expr, &EntityTypeResourceConstraintVisitor)
    }
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
