use alloc::{borrow::Cow, sync::Arc};
use core::error::Error;

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use smol_str::SmolStr;
use type_system::{
    knowledge::entity::id::EntityUuid,
    ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion},
    web::OwnedById,
};

use crate::policies::{PartialResourceId, cedar::CedarEntityId as _, resource::EntityTypeId};

#[derive(Debug)]
pub enum PolicyExpressionTree {
    Not(Box<Self>),
    All(Vec<Self>),

    Any(Vec<Self>),
    Is(PartialResourceId<'static>),
    In(OwnedById),
    BaseUrl(BaseUrl),
    OntologyTypeVersion(OntologyTypeVersion),
    IsOfType(VersionedUrl),
}

#[derive(Debug, derive_more::Display)]
pub(crate) enum ParseBinaryExpressionError {
    #[display("Invalid left part")]
    Left,
    #[display("Invalid right part")]
    Right,
}

impl Error for ParseBinaryExpressionError {}

#[derive(Debug, derive_more::Display)]
pub(crate) enum ParseGetAttrExpressionError {
    #[display("No resource variable found")]
    NoResourceVariable,
    #[display("Invalid attribute: `{_0}`")]
    InvalidAttribute(SmolStr),
}

impl Error for ParseGetAttrExpressionError {}

#[derive(Debug, derive_more::Display)]
pub(crate) enum ParseExpressionError {
    #[display("Could not parse `&&` expression")]
    AndExpression,
    #[display("Could not parse `||` expression")]
    OrExpression,
    #[display("Could not parse `!` expression")]
    NotExpression,

    #[display("Could not parse `==` expression")]
    EqExpression,
    #[display("Could not parse `in` expression")]
    InExpression,
    #[display("Could not parse `contains` expression")]
    ContainsExpression,

    #[display("Unexpected expression")]
    Unexpected,
}

impl Error for ParseExpressionError {}

impl PolicyExpressionTree {
    pub(crate) fn from_expr(expr: &ast::Expr) -> Result<Self, Report<ParseExpressionError>> {
        match expr.expr_kind() {
            ast::ExprKind::Lit(ast::Literal::Bool(true)) => Ok(Self::All(Vec::new())),
            ast::ExprKind::Lit(ast::Literal::Bool(false)) => Ok(Self::Any(Vec::new())),
            ast::ExprKind::And { left, right } => {
                Self::from_and(left, right).change_context(ParseExpressionError::AndExpression)
            }
            ast::ExprKind::Or { left, right } => {
                Self::from_or(left, right).change_context(ParseExpressionError::OrExpression)
            }
            ast::ExprKind::UnaryApp {
                op: ast::UnaryOp::Not,
                arg,
            } => Self::from_expr(arg)
                .map(Self::not)
                .change_context(ParseExpressionError::NotExpression),
            ast::ExprKind::BinaryApp {
                op: ast::BinaryOp::Eq,
                arg1,
                arg2,
            } => Self::from_eq(arg1, arg2).change_context(ParseExpressionError::EqExpression),
            ast::ExprKind::BinaryApp {
                op: ast::BinaryOp::In,
                arg1,
                arg2,
            } => Self::from_in(arg1, arg2).change_context(ParseExpressionError::InExpression),
            ast::ExprKind::BinaryApp {
                op: ast::BinaryOp::Contains,
                arg1,
                arg2,
            } => Self::from_contains(arg1, arg2)
                .change_context(ParseExpressionError::ContainsExpression),
            _ => Err(Report::new(ParseExpressionError::Unexpected)),
        }
        .attach_printable_lazy(|| expr.clone())
    }

    fn not(self) -> Self {
        Self::Not(Box::new(self))
    }

    fn from_and(
        lhs: &Arc<ast::Expr>,
        rhs: &Arc<ast::Expr>,
    ) -> Result<Self, Report<[ParseBinaryExpressionError]>> {
        let left_expr = Self::from_expr(lhs).change_context(ParseBinaryExpressionError::Left);
        let right_expr = Self::from_expr(rhs).change_context(ParseBinaryExpressionError::Right);
        let (lhs, rhs) = (left_expr, right_expr).try_collect()?;

        let mut all = match lhs {
            Self::All(expressions) => expressions,
            expression => vec![expression],
        };

        match rhs {
            Self::All(expressions) => all.extend(expressions),
            expression => all.push(expression),
        }

        if all.len() == 1 {
            Ok(all.pop().unwrap_or_else(|| unreachable!()))
        } else {
            Ok(Self::All(all))
        }
    }

    fn from_or(
        lhs: &Arc<ast::Expr>,
        rhs: &Arc<ast::Expr>,
    ) -> Result<Self, Report<[ParseBinaryExpressionError]>> {
        let left_expr = Self::from_expr(lhs).change_context(ParseBinaryExpressionError::Left);
        let right_expr = Self::from_expr(rhs).change_context(ParseBinaryExpressionError::Right);
        let (lhs, rhs) = (left_expr, right_expr).try_collect()?;

        let mut any = match lhs {
            Self::Any(expressions) => expressions,
            expression => vec![expression],
        };

        match rhs {
            Self::Any(expressions) => any.extend(expressions),
            expression => any.push(expression),
        }

        if any.len() == 1 {
            Ok(any.pop().unwrap_or_else(|| unreachable!()))
        } else {
            Ok(Self::Any(any))
        }
    }

    fn expect_resource_variable(
        expr: &Arc<ast::Expr>,
    ) -> Result<(), Report<ParseGetAttrExpressionError>> {
        match expr.expr_kind() {
            ast::ExprKind::Var(ast::Var::Resource) => Ok(()),
            _ => Err(Report::new(ParseGetAttrExpressionError::NoResourceVariable)
                .attach_printable(Arc::clone(expr))),
        }
    }

    fn from_in(
        lhs: &Arc<ast::Expr>,
        rhs: &Arc<ast::Expr>,
    ) -> Result<Self, Report<ParseBinaryExpressionError>> {
        Self::expect_resource_variable(lhs)
            .change_context(ParseBinaryExpressionError::Left)
            .attach_printable_lazy(|| Arc::clone(lhs))?;

        match rhs.expr_kind() {
            ast::ExprKind::Lit(ast::Literal::EntityUID(euid)) => OwnedById::from_euid(euid)
                .change_context(ParseBinaryExpressionError::Right)
                .map(Self::In),
            _ => Err(Report::new(ParseExpressionError::Unexpected)
                .change_context(ParseBinaryExpressionError::Right)),
        }
        .attach_printable(Arc::clone(rhs))
    }

    fn from_eq(
        lhs: &Arc<ast::Expr>,
        rhs: &Arc<ast::Expr>,
    ) -> Result<Self, Report<ParseBinaryExpressionError>> {
        enum AttributeType {
            BaseUrl,
            OntologyTypeVersion,
            Resource,
        }

        let attribute_type = match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                let attr_type = match attr.as_str() {
                    "base_url" => Ok(AttributeType::BaseUrl),
                    "ontology_type_version" => Ok(AttributeType::OntologyTypeVersion),
                    _ => Err(Report::new(ParseGetAttrExpressionError::InvalidAttribute(
                        attr.clone(),
                    ))),
                };

                let ((), attr_type) = (Self::expect_resource_variable(expr), attr_type)
                    .try_collect()
                    .change_context(ParseBinaryExpressionError::Left)
                    .attach_printable_lazy(|| Arc::clone(lhs))?;
                attr_type
            }
            ast::ExprKind::Var(ast::Var::Resource) => AttributeType::Resource,
            _ => {
                return Err(
                    Report::new(ParseBinaryExpressionError::Left).attach_printable(Arc::clone(lhs))
                );
            }
        };

        match (attribute_type, rhs.expr_kind()) {
            (AttributeType::BaseUrl, ast::ExprKind::Lit(ast::Literal::String(string))) => {
                BaseUrl::new(string.to_string())
                    .change_context(ParseBinaryExpressionError::Right)
                    .map(Self::BaseUrl)
            }
            (AttributeType::OntologyTypeVersion, ast::ExprKind::Lit(ast::Literal::Long(long))) => {
                u32::try_from(*long)
                    .change_context(ParseBinaryExpressionError::Right)
                    .map(|version| Self::OntologyTypeVersion(OntologyTypeVersion::new(version)))
            }
            (AttributeType::Resource, ast::ExprKind::Lit(ast::Literal::EntityUID(euid))) => {
                if *euid.entity_type() == **EntityTypeId::entity_type() {
                    EntityTypeId::from_eid(euid.eid())
                        .map(|id| PartialResourceId::EntityType(Some(Cow::Owned(id))))
                        .change_context(ParseBinaryExpressionError::Right)
                } else if *euid.entity_type() == **EntityUuid::entity_type() {
                    EntityUuid::from_eid(euid.eid())
                        .map(|id| PartialResourceId::Entity(Some(id)))
                        .change_context(ParseBinaryExpressionError::Right)
                } else {
                    Err(Report::new(ParseExpressionError::Unexpected)
                        .change_context(ParseBinaryExpressionError::Right))
                }
                .map(Self::Is)
            }
            _ => Err(Report::new(ParseExpressionError::Unexpected)
                .change_context(ParseBinaryExpressionError::Right)),
        }
        .attach_printable_lazy(|| Arc::clone(rhs))
    }

    fn from_contains(
        lhs: &Arc<ast::Expr>,
        rhs: &Arc<ast::Expr>,
    ) -> Result<Self, Report<ParseBinaryExpressionError>> {
        enum AttributeType {
            IsOfType,
        }

        let attribute_type = match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                let attr_type = match attr.as_str() {
                    "entity_types" => Ok(AttributeType::IsOfType),
                    _ => Err(Report::new(ParseGetAttrExpressionError::InvalidAttribute(
                        attr.clone(),
                    ))),
                };

                let ((), attr_type) = (Self::expect_resource_variable(expr), attr_type)
                    .try_collect()
                    .change_context(ParseBinaryExpressionError::Left)
                    .attach_printable_lazy(|| Arc::clone(lhs))?;
                attr_type
            }
            _ => {
                return Err(
                    Report::new(ParseBinaryExpressionError::Left).attach_printable(Arc::clone(lhs))
                );
            }
        };

        match (attribute_type, rhs.expr_kind()) {
            (AttributeType::IsOfType, ast::ExprKind::Lit(ast::Literal::EntityUID(euid))) => {
                EntityTypeId::from_euid(euid)
                    .change_context(ParseBinaryExpressionError::Right)
                    .map(|id| Self::IsOfType(id.into_url()))
            }
            _ => Err(Report::new(ParseExpressionError::Unexpected)
                .change_context(ParseBinaryExpressionError::Right)),
        }
        .attach_printable_lazy(|| Arc::clone(rhs))
    }
}
