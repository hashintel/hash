use alloc::{borrow::Cow, sync::Arc};
use core::{error::Error, fmt, iter, ptr, str::FromStr as _};
use std::{collections::HashSet, sync::LazyLock};

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::{Report, ResultExt as _};
use smol_str::SmolStr;
use type_system::{
    ontology::id::{BaseUrl, OntologyTypeVersion, ParseVersionedUrlError, VersionedUrl},
    principal::actor_group::WebId,
};

use crate::policies::cedar::{
    CedarExpressionParseError, FromCedarEntityId, FromCedarExpr, PolicyExpressionTree,
    ToCedarEntityId, ToCedarExpr,
};

#[derive(
    Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[repr(transparent)]
pub struct PropertyTypeId(#[cfg_attr(feature = "codegen", specta(type = String))] VersionedUrl);

impl From<&VersionedUrl> for &PropertyTypeId {
    #[expect(
        unsafe_code,
        reason = "There is no way to transmute from `&VersionedUrl` to `&PropertyTypeId` without \
                  `unsafe`"
    )]
    fn from(url: &VersionedUrl) -> Self {
        const {
            // We cannot compile-check that `VersionedUrl` is the inner type of `PropertyTypeId`,
            // which in theory should be possible with `Facet`, but having a few checks
            // here is better than none.
            assert!(size_of::<VersionedUrl>() == size_of::<PropertyTypeId>());
            assert!(align_of::<VersionedUrl>() == align_of::<PropertyTypeId>());
        }

        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref::<VersionedUrl>(url).cast::<PropertyTypeId>() }
    }
}

impl PropertyTypeId {
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

impl fmt::Display for PropertyTypeId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Debug)]
pub struct PropertyTypeResource<'a> {
    pub id: Cow<'a, PropertyTypeId>,
    pub web_id: Option<WebId>,
}

impl PropertyTypeResource<'_> {
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
                (
                    SmolStr::new_static("is_remote"),
                    ast::RestrictedExpr::val(self.web_id.is_none()),
                ),
            ],
            HashSet::new(),
            self.web_id
                .as_ref()
                .into_iter()
                .map(WebId::to_euid)
                .collect(),
            iter::empty(),
            Extensions::none(),
        )
        .expect("Property type should be a valid Cedar entity")
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum PropertyTypeResourceFilter {
    #[serde(rename_all = "camelCase")]
    All { filters: Vec<Self> },
    #[serde(rename_all = "camelCase")]
    Any { filters: Vec<Self> },
    #[serde(rename_all = "camelCase")]
    Not { filter: Box<Self> },
    #[serde(rename_all = "camelCase")]
    IsBaseUrl { base_url: BaseUrl },
    #[serde(rename_all = "camelCase")]
    IsVersion { version: OntologyTypeVersion },
    #[serde(rename_all = "camelCase")]
    IsRemote,
}

#[derive(Debug, derive_more::Display)]
#[display("expression is not supported: {_0:?}")]
pub struct InvalidPropertyTypeResourceFilter(PolicyExpressionTree);

impl Error for InvalidPropertyTypeResourceFilter {}

impl TryFrom<PolicyExpressionTree> for PropertyTypeResourceFilter {
    type Error = Report<InvalidPropertyTypeResourceFilter>;

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
            condition @ (PolicyExpressionTree::Is(_)
            | PolicyExpressionTree::In(_)
            | PolicyExpressionTree::IsOfType(_)
            | PolicyExpressionTree::IsOfBaseType(_)
            | PolicyExpressionTree::CreatedByPrincipal) => {
                Err(Report::new(InvalidPropertyTypeResourceFilter(condition)))
            }
        }
    }
}

impl ToCedarExpr for PropertyTypeResourceFilter {
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
            Self::IsRemote => ast::Expr::get_attr(
                ast::Expr::var(ast::Var::Resource),
                SmolStr::new_static("is_remote"),
            ),
        }
    }
}

impl FromCedarExpr for PropertyTypeResourceFilter {
    type Error = Report<CedarExpressionParseError>;

    fn from_cedar(expr: &ast::Expr) -> Result<Self, Self::Error> {
        PolicyExpressionTree::from_expr(expr)
            .change_context(CedarExpressionParseError::ParseError)?
            .try_into()
            .change_context(CedarExpressionParseError::ParseError)
    }
}

impl FromCedarEntityId for PropertyTypeId {
    type Error = Report<ParseVersionedUrlError>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static PROPERTY_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["PropertyType"]));
        &PROPERTY_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(VersionedUrl::from_str(eid.as_ref())?))
    }
}

impl ToCedarEntityId for PropertyTypeId {
    fn to_cedar_entity_type(&self) -> &'static Arc<ast::EntityType> {
        Self::entity_type()
    }

    fn to_eid(&self) -> ast::Eid {
        ast::Eid::new(self.as_url().to_string())
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(untagged, deny_unknown_fields)]
pub enum PropertyTypeResourceConstraint {
    #[serde(rename_all = "camelCase")]
    Any { filter: PropertyTypeResourceFilter },
    #[serde(rename_all = "camelCase")]
    Exact { id: PropertyTypeId },
    #[serde(rename_all = "camelCase")]
    Web {
        web_id: WebId,
        filter: PropertyTypeResourceFilter,
    },
}

#[derive(Debug)]
pub enum PropertyTypeResourceConstraints {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    IsBaseUrl(BaseUrl),
    IsVersion(OntologyTypeVersion),
    IsPropertyType(VersionedUrl),
    InWeb(WebId),
}

impl PropertyTypeResourceConstraint {
    #[must_use]
    pub(crate) fn to_cedar(&self) -> (ast::ResourceConstraint, ast::Expr) {
        match self {
            Self::Any { filter } => (
                ast::ResourceConstraint::is_entity_type(Arc::clone(PropertyTypeId::entity_type())),
                filter.to_cedar_expr(),
            ),
            Self::Exact { id } => (
                ast::ResourceConstraint::is_eq(Arc::new(id.to_euid())),
                ast::Expr::val(true),
            ),
            Self::Web { web_id, filter } => (
                ast::ResourceConstraint::is_entity_type_in(
                    Arc::clone(PropertyTypeId::entity_type()),
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

    use super::{PropertyTypeId, PropertyTypeResourceConstraint, PropertyTypeResourceFilter};
    use crate::{
        policies::{ResourceConstraint, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            Some(ResourceConstraint::PropertyType(
                PropertyTypeResourceConstraint::Any {
                    filter: PropertyTypeResourceFilter::All { filters: vec![] },
                },
            )),
            json!({
                "type": "propertyType",
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            "resource is HASH::PropertyType",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "propertyType",
                "additional": "unexpected"
            }),
            "data did not match any variant of untagged enum PropertyTypeResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_exact() -> Result<(), Box<dyn Error>> {
        let property_type_id = PropertyTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@hash/types/entity-type/user/v/1",
        )?);

        check_resource(
            Some(ResourceConstraint::PropertyType(
                PropertyTypeResourceConstraint::Exact {
                    id: property_type_id.clone(),
                },
            )),
            json!({
                "type": "propertyType",
                "id": property_type_id,
            }),
            format!(r#"resource == HASH::PropertyType::"{property_type_id}""#),
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "propertyType",
                "webId": WebId::new(Uuid::new_v4()),
                "id": property_type_id,
            }),
            "data did not match any variant of untagged enum PropertyTypeResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = WebId::new(Uuid::new_v4());
        check_resource(
            Some(ResourceConstraint::PropertyType(
                PropertyTypeResourceConstraint::Web {
                    web_id,
                    filter: PropertyTypeResourceFilter::All { filters: vec![] },
                },
            )),
            json!({
                "type": "propertyType",
                "webId": web_id,
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            format!(r#"resource is HASH::PropertyType in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "propertyType",
                "webId": WebId::new(Uuid::new_v4()),
                "id": EntityUuid::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum PropertyTypeResourceConstraint",
        )?;

        Ok(())
    }
}
