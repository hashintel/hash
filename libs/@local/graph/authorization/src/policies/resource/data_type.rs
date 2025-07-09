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
pub struct DataTypeId(#[cfg_attr(feature = "codegen", specta(type = String))] VersionedUrl);

impl From<&VersionedUrl> for &DataTypeId {
    #[expect(
        unsafe_code,
        reason = "There is no way to transmute from `&VersionedUrl` to `&DataTypeId` without \
                  `unsafe`"
    )]
    fn from(url: &VersionedUrl) -> Self {
        const {
            // We cannot compile-check that `VersionedUrl` is the inner type of `DataTypeId`,
            // which in theory should be possible with `Facet`, but having a few checks
            // here is better than none.
            assert!(size_of::<VersionedUrl>() == size_of::<DataTypeId>());
            assert!(align_of::<VersionedUrl>() == align_of::<DataTypeId>());
        }

        // SAFETY: Self is `repr(transparent)`
        unsafe { &*ptr::from_ref::<VersionedUrl>(url).cast::<DataTypeId>() }
    }
}

impl DataTypeId {
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

impl fmt::Display for DataTypeId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[derive(Debug)]
pub struct DataTypeResource<'a> {
    pub id: Cow<'a, DataTypeId>,
    pub web_id: Option<WebId>,
}

impl DataTypeResource<'_> {
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
        .expect("Data type should be a valid Cedar entity")
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum DataTypeResourceFilter {
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
pub struct InvalidDataTypeResourceFilter(PolicyExpressionTree);

impl Error for InvalidDataTypeResourceFilter {}

impl TryFrom<PolicyExpressionTree> for DataTypeResourceFilter {
    type Error = Report<InvalidDataTypeResourceFilter>;

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
                Err(Report::new(InvalidDataTypeResourceFilter(condition)))
            }
        }
    }
}

impl ToCedarExpr for DataTypeResourceFilter {
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

impl FromCedarExpr for DataTypeResourceFilter {
    type Error = Report<CedarExpressionParseError>;

    fn from_cedar(expr: &ast::Expr) -> Result<Self, Self::Error> {
        PolicyExpressionTree::from_expr(expr)
            .change_context(CedarExpressionParseError::ParseError)?
            .try_into()
            .change_context(CedarExpressionParseError::ParseError)
    }
}

impl FromCedarEntityId for DataTypeId {
    type Error = Report<ParseVersionedUrlError>;

    fn entity_type() -> &'static Arc<ast::EntityType> {
        static DATA_TYPE: LazyLock<Arc<ast::EntityType>> =
            LazyLock::new(|| crate::policies::cedar_resource_type(["DataType"]));
        &DATA_TYPE
    }

    fn from_eid(eid: &ast::Eid) -> Result<Self, Self::Error> {
        Ok(Self::new(VersionedUrl::from_str(eid.as_ref())?))
    }
}

impl ToCedarEntityId for DataTypeId {
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
pub enum DataTypeResourceConstraint {
    #[serde(rename_all = "camelCase")]
    Any { filter: DataTypeResourceFilter },
    #[serde(rename_all = "camelCase")]
    Exact { id: DataTypeId },
    #[serde(rename_all = "camelCase")]
    Web {
        web_id: WebId,
        filter: DataTypeResourceFilter,
    },
}

#[derive(Debug)]
pub enum DataTypeResourceConstraints {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    IsBaseUrl(BaseUrl),
    IsVersion(OntologyTypeVersion),
    IsDataType(VersionedUrl),
    InWeb(WebId),
}

impl DataTypeResourceConstraint {
    #[must_use]
    pub(crate) fn to_cedar(&self) -> (ast::ResourceConstraint, ast::Expr) {
        match self {
            Self::Any { filter } => (
                ast::ResourceConstraint::is_entity_type(Arc::clone(DataTypeId::entity_type())),
                filter.to_cedar_expr(),
            ),
            Self::Exact { id } => (
                ast::ResourceConstraint::is_eq(Arc::new(id.to_euid())),
                ast::Expr::val(true),
            ),
            Self::Web { web_id, filter } => (
                ast::ResourceConstraint::is_entity_type_in(
                    Arc::clone(DataTypeId::entity_type()),
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

    use super::{DataTypeId, DataTypeResourceConstraint, DataTypeResourceFilter};
    use crate::{
        policies::{ResourceConstraint, resource::tests::check_resource},
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            Some(ResourceConstraint::DataType(
                DataTypeResourceConstraint::Any {
                    filter: DataTypeResourceFilter::All { filters: vec![] },
                },
            )),
            json!({
                "type": "dataType",
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            "resource is HASH::DataType",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "dataType",
                "additional": "unexpected"
            }),
            "data did not match any variant of untagged enum DataTypeResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_exact() -> Result<(), Box<dyn Error>> {
        let data_type_id = DataTypeId::new(VersionedUrl::from_str(
            "https://hash.ai/@hash/types/entity-type/user/v/1",
        )?);

        check_resource(
            Some(ResourceConstraint::DataType(
                DataTypeResourceConstraint::Exact {
                    id: data_type_id.clone(),
                },
            )),
            json!({
                "type": "dataType",
                "id": data_type_id,
            }),
            format!(r#"resource == HASH::DataType::"{data_type_id}""#),
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "dataType",
                "webId": WebId::new(Uuid::new_v4()),
                "id": data_type_id,
            }),
            "data did not match any variant of untagged enum DataTypeResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = WebId::new(Uuid::new_v4());
        check_resource(
            Some(ResourceConstraint::DataType(
                DataTypeResourceConstraint::Web {
                    web_id,
                    filter: DataTypeResourceFilter::All { filters: vec![] },
                },
            )),
            json!({
                "type": "dataType",
                "webId": web_id,
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            format!(r#"resource is HASH::DataType in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "dataType",
                "webId": WebId::new(Uuid::new_v4()),
                "id": EntityUuid::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum DataTypeResourceConstraint",
        )?;

        Ok(())
    }
}
