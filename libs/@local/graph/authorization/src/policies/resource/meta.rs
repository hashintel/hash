use alloc::sync::Arc;
use core::{error::Error, iter};
use std::collections::HashSet;

use cedar_policy_core::{ast, extensions::Extensions};
use error_stack::{Report, ResultExt as _};
use smol_str::{SmolStr, ToSmolStr as _};
use type_system::principal::actor_group::WebId;

use super::{
    DataTypeResourceConstraint, EntityResourceConstraint, EntityTypeResourceConstraint,
    PropertyTypeResourceConstraint, ResourceConstraint,
};
use crate::policies::{
    Policy, PolicyExpressionTree, PolicyId,
    action::ActionName,
    cedar::{
        CedarExpressionParseError, FromCedarEntityId as _, FromCedarExpr, ToCedarEntityId as _,
        ToCedarExpr,
    },
};

pub struct PolicyMetaResource<'a> {
    pub id: PolicyId,
    pub actions: &'a [ActionName],
    pub resource: Option<&'a ResourceConstraint>,
}

impl PolicyMetaResource<'_> {
    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        let parents = match self.resource {
            Some(
                ResourceConstraint::Web { web_id, .. }
                | ResourceConstraint::Meta(MetaResourceConstraint::Web { web_id, .. })
                | ResourceConstraint::Entity(EntityResourceConstraint::Web { web_id, .. })
                | ResourceConstraint::EntityType(EntityTypeResourceConstraint::Web {
                    web_id, ..
                })
                | ResourceConstraint::PropertyType(PropertyTypeResourceConstraint::Web {
                    web_id,
                    ..
                })
                | ResourceConstraint::DataType(DataTypeResourceConstraint::Web { web_id, .. }),
            ) => HashSet::from([web_id.to_euid()]),
            _ => HashSet::new(),
        };
        ast::Entity::new(
            self.id.to_euid(),
            [(
                SmolStr::new_static("actions"),
                ast::RestrictedExpr::set(
                    self.actions
                        .iter()
                        .map(|action| ast::RestrictedExpr::val(action.to_smolstr())),
                ),
            )],
            HashSet::new(),
            parents,
            iter::empty(),
            Extensions::none(),
        )
        .expect("Policy should be a valid Cedar entity")
    }
}

impl<'a> From<&'a Policy> for PolicyMetaResource<'a> {
    fn from(policy: &'a Policy) -> Self {
        Self {
            id: policy.id,
            actions: &policy.actions,
            resource: policy.resource.as_ref(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum MetaResourceFilter {
    #[serde(rename_all = "camelCase")]
    All { filters: Vec<Self> },
    #[serde(rename_all = "camelCase")]
    Any { filters: Vec<Self> },
    #[serde(rename_all = "camelCase")]
    Not { filter: Box<Self> },
    #[serde(rename_all = "camelCase")]
    HasAction { action: ActionName },
}

#[derive(Debug, derive_more::Display)]
#[display("expression is not supported: {_0:?}")]
pub struct InvalidMetaResourceFilter(PolicyExpressionTree);

impl Error for InvalidMetaResourceFilter {}

impl TryFrom<PolicyExpressionTree> for MetaResourceFilter {
    type Error = Report<InvalidMetaResourceFilter>;

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
            PolicyExpressionTree::HasAction(action) => Ok(Self::HasAction { action }),
            condition @ (PolicyExpressionTree::Is(_)
            | PolicyExpressionTree::In(_)
            | PolicyExpressionTree::BaseUrl(_)
            | PolicyExpressionTree::IsOfType(_)
            | PolicyExpressionTree::IsOfBaseType(_)
            | PolicyExpressionTree::OntologyTypeVersion(_)
            | PolicyExpressionTree::CreatedByPrincipal) => {
                Err(Report::new(InvalidMetaResourceFilter(condition)))
            }
        }
    }
}

impl ToCedarExpr for MetaResourceFilter {
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
            Self::HasAction { action } => ast::Expr::contains(
                ast::Expr::get_attr(
                    ast::Expr::var(ast::Var::Resource),
                    SmolStr::new_static("actions"),
                ),
                ast::Expr::val(action.to_smolstr()),
            ),
        }
    }
}

impl FromCedarExpr for MetaResourceFilter {
    type Error = Report<CedarExpressionParseError>;

    fn from_cedar(expr: &ast::Expr) -> Result<Self, Self::Error> {
        PolicyExpressionTree::from_expr(expr)
            .change_context(CedarExpressionParseError::ParseError)?
            .try_into()
            .change_context(CedarExpressionParseError::ParseError)
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(untagged, deny_unknown_fields)]
pub enum MetaResourceConstraint {
    #[serde(rename_all = "camelCase")]
    Any { filter: MetaResourceFilter },
    #[serde(rename_all = "camelCase")]
    Web {
        web_id: WebId,
        filter: MetaResourceFilter,
    },
}

impl MetaResourceConstraint {
    #[must_use]
    pub(crate) fn to_cedar_resource_constraint(&self) -> (ast::ResourceConstraint, ast::Expr) {
        match self {
            Self::Any { filter } => (
                ast::ResourceConstraint::is_entity_type(Arc::clone(PolicyId::entity_type())),
                filter.to_cedar_expr(),
            ),
            Self::Web { web_id, filter } => (
                ast::ResourceConstraint::is_entity_type_in(
                    Arc::clone(PolicyId::entity_type()),
                    Arc::new(web_id.to_euid()),
                ),
                filter.to_cedar_expr(),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::error::Error;

    use serde_json::json;
    use type_system::principal::actor_group::WebId;
    use uuid::Uuid;

    use crate::{
        policies::{
            PolicyId, ResourceConstraint,
            action::ActionName,
            resource::{MetaResourceConstraint, meta::MetaResourceFilter, tests::check_resource},
        },
        test_utils::check_deserialization_error,
    };

    #[test]
    fn constraint_in_any() -> Result<(), Box<dyn Error>> {
        check_resource(
            Some(ResourceConstraint::Meta(MetaResourceConstraint::Any {
                filter: MetaResourceFilter::All { filters: vec![] },
            })),
            json!({
                "type": "meta",
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            "resource is HASH::Policy",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "meta",
                "webId": WebId::new(Uuid::new_v4()),
                "id": PolicyId::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum MetaResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_any_with_action() -> Result<(), Box<dyn Error>> {
        check_resource(
            Some(ResourceConstraint::Meta(MetaResourceConstraint::Any {
                filter: MetaResourceFilter::HasAction {
                    action: ActionName::CreateWeb,
                },
            })),
            json!({
                "type": "meta",
                "filter": {
                    "type": "hasAction",
                    "action": "createWeb",
                },
            }),
            "resource is HASH::Policy",
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "meta",
                "webId": WebId::new(Uuid::new_v4()),
                "id": PolicyId::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum MetaResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web() -> Result<(), Box<dyn Error>> {
        let web_id = WebId::new(Uuid::new_v4());
        check_resource(
            Some(ResourceConstraint::Meta(MetaResourceConstraint::Web {
                web_id,
                filter: MetaResourceFilter::All { filters: vec![] },
            })),
            json!({
                "type": "meta",
                "webId": web_id,
                "filter": {
                    "type": "all",
                    "filters": [],
                },
            }),
            format!(r#"resource is HASH::Policy in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "meta",
                "webId": WebId::new(Uuid::new_v4()),
                "id": PolicyId::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum MetaResourceConstraint",
        )?;

        Ok(())
    }

    #[test]
    fn constraint_in_web_with_action() -> Result<(), Box<dyn Error>> {
        let web_id = WebId::new(Uuid::new_v4());
        check_resource(
            Some(ResourceConstraint::Meta(MetaResourceConstraint::Web {
                web_id,
                filter: MetaResourceFilter::HasAction {
                    action: ActionName::View,
                },
            })),
            json!({
                "type": "meta",
                "webId": web_id,
                "filter": {
                    "type": "hasAction",
                    "action": "view",
                },
            }),
            format!(r#"resource is HASH::Policy in HASH::Web::"{web_id}""#),
        )?;

        check_deserialization_error::<ResourceConstraint>(
            json!({
                "type": "meta",
                "webId": WebId::new(Uuid::new_v4()),
                "id": PolicyId::new(Uuid::new_v4()),
            }),
            "data did not match any variant of untagged enum MetaResourceConstraint",
        )?;

        Ok(())
    }
}
