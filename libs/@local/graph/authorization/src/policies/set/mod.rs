use core::{error::Error, fmt};

use cedar_policy_core::{
    ast,
    authorizer::{Authorizer, Decision},
};
use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _, bail};
use type_system::{
    knowledge::entity::id::EntityUuid,
    ontology::{BaseUrl, VersionedUrl, id::OntologyTypeVersion},
    web::OwnedById,
};

use super::{
    Context, Policy, Request,
    cedar::{
        CedarEntityId as _, CedarExpressionVisitorError, UnexpectedCedarExpression,
        VisitCedarExpressionError,
    },
    resource::EntityTypeId,
};
use crate::{
    policies::cedar::{CedarExpressionVisitor, EntityTypeIdVisitor, ExpressionSetVisitor},
    zanzibar::types::Resource,
};

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("policy set insertion failed")]
pub struct PolicySetInsertionError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("policy set evaluation failed")]
pub struct PolicyEvaluationError;

#[derive(Default)]
pub struct PolicySet {
    policies: ast::PolicySet,
}

impl fmt::Debug for PolicySet {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for policy in self.policies.policies() {
            writeln!(fmt, "{policy}\n")?;
        }
        for policy in self.policies.templates() {
            writeln!(fmt, "{policy}\n")?;
        }
        Ok(())
    }
}

#[derive(Debug, derive_more::Display)]
pub struct ConstraintConversionError {
    kind: ConstraintConversionErrorKind,
}

impl Error for ConstraintConversionError {}

#[derive(Debug, derive_more::Display)]
#[display("policy constraint conversion failed: {_variant}")]
enum ConstraintConversionErrorKind {
    #[display("unknown expression: {_0}")]
    UnknownExpr(ast::Expr),
    #[display("unknown literal: {_0}")]
    UnknownLiteral(ast::Literal),
    #[display("unknown binary operator: {_0}")]
    UnknownBinaryOp(ast::BinaryOp),
    #[display("unknown unary operator: {_0}")]
    UnknownUnaryOp(ast::UnaryOp),
    #[display("unknown lhs for `eq`: {_0}")]
    UnknownLhsForEq(ast::Expr),
    #[display("unknown rhs for `eq`: {_0}")]
    UnknownRhsForEq(ast::Expr),
    #[display("unknown lhs for `in`: {_0}")]
    UnknownLhsForIn(ast::Expr),
    #[display("unknown rhs for `in`: {_0}")]
    UnknownRhsForIn(ast::Expr),
    #[display("unknown lhs for `contains`: {_0}")]
    UnknownLhsForContains(ast::Expr),
    #[display("unknown rhs for `contains`: {_0}")]
    UnknownRhsForContains(ast::Expr),
    #[display("unknown expression for `is`: {_0}")]
    UnknownExprForIs(ast::Expr),
    #[display("unknown entity type for `is`: {_0}")]
    UnknownEntityTypeForIs(ast::EntityType),
    #[display("unexpected attribute: {_0}")]
    UnexpectedAttribute(String),
    #[display("unexpected expression")]
    UnexpectedExpr,
}

impl CedarExpressionVisitorError for ConstraintConversionError {
    fn unexpected_expression() -> Self {
        Self {
            kind: ConstraintConversionErrorKind::UnexpectedExpr,
        }
    }
}

#[derive(Debug)]
pub enum PolicyConstraint {
    All { filters: Vec<Self> },
    Any { filters: Vec<Self> },
    Not { filter: Box<Self> },
    IsBaseUrl { base_url: BaseUrl },
    IsVersion { version: OntologyTypeVersion },
    IsOfType { entity_type: VersionedUrl },
    IsAllTypes { entity_types: Vec<VersionedUrl> },
    IsAnyType { entity_types: Vec<VersionedUrl> },
    IsEntityType { id: Option<VersionedUrl> },
    IsEntity { id: Option<EntityUuid> },
    InWeb { web: OwnedById },
}

struct ResourceVariableVisitor;

impl CedarExpressionVisitor for ResourceVariableVisitor {
    type Error = ConstraintConversionError;
    type Value = ();

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "resource variable")
    }

    fn visit_resource_variable(&self) -> Result<Self::Value, Report<Self::Error>> {
        Ok(())
    }

    fn visit_unknown(&self, name: &str) -> Result<Self::Value, Report<Self::Error>> {
        if name == "resource" {
            Ok(())
        } else {
            Err(Report::new(VisitCedarExpressionError::new(
                self,
                UnexpectedCedarExpression::Unknown(name.to_owned()),
            )))
            .change_context(Self::Error::unexpected_expression())
        }
    }
}

struct PolicyConstraintVisitor;

impl CedarExpressionVisitor for PolicyConstraintVisitor {
    type Error = ConstraintConversionError;
    type Value = PolicyConstraint;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "policy constraint")
    }

    fn visit_bool(&self, bool: bool) -> Result<Self::Value, Report<Self::Error>> {
        if bool {
            Ok(PolicyConstraint::All {
                filters: Vec::new(),
            })
        } else {
            Ok(PolicyConstraint::Any {
                filters: Vec::new(),
            })
        }
    }

    fn visit_and(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<PolicyConstraint, Report<ConstraintConversionError>> {
        let mut all_filters = Vec::new();
        match self.visit_expr(lhs)? {
            PolicyConstraint::All { filters } => all_filters.extend(filters),
            constraint => all_filters.push(constraint),
        }
        match self.visit_expr(rhs)? {
            PolicyConstraint::All { filters } => all_filters.extend(filters),
            constraint => all_filters.push(constraint),
        }

        if all_filters.len() == 1 {
            Ok(all_filters.pop().expect("should have exactly one filter"))
        } else {
            Ok(PolicyConstraint::All {
                filters: all_filters,
            })
        }
    }

    fn visit_or(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<PolicyConstraint, Report<ConstraintConversionError>> {
        let mut any_filters = Vec::new();
        match self.visit_expr(lhs)? {
            PolicyConstraint::Any { filters } => any_filters.extend(filters),
            constraint => any_filters.push(constraint),
        }
        match self.visit_expr(rhs)? {
            PolicyConstraint::Any { filters } => any_filters.extend(filters),
            constraint => any_filters.push(constraint),
        }

        if any_filters.len() == 1 {
            Ok(any_filters.pop().expect("should have exactly one filter"))
        } else {
            Ok(PolicyConstraint::Any {
                filters: any_filters,
            })
        }
    }

    fn visit_not(
        &self,
        expr: &ast::Expr,
    ) -> Result<PolicyConstraint, Report<ConstraintConversionError>> {
        Ok(PolicyConstraint::Not {
            filter: Box::new(self.visit_expr(expr)?),
        })
    }

    fn visit_is(
        &self,
        expr: &ast::Expr,
        entity_type: &ast::EntityType,
    ) -> Result<Self::Value, Report<Self::Error>> {
        ResourceVariableVisitor.visit_expr(&expr)?;

        if *entity_type == **EntityTypeId::entity_type() {
            Ok(PolicyConstraint::IsEntityType { id: None })
        } else if *entity_type == **EntityUuid::entity_type() {
            Ok(PolicyConstraint::IsEntity { id: None })
        } else {
            bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownEntityTypeForIs(entity_type.clone()),
            });
        }
    }

    fn visit_contains(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                // We expect the lhs to be a resource variable.
                ResourceVariableVisitor.visit_expr(&expr)?;

                match attr.as_str() {
                    "entity_types" => {
                        return Ok(PolicyConstraint::IsOfType {
                            entity_type: EntityTypeIdVisitor.visit_expr(rhs).change_context_lazy(
                                || ConstraintConversionError {
                                    kind: ConstraintConversionErrorKind::UnknownRhsForContains(
                                        rhs.clone(),
                                    ),
                                },
                            )?,
                        });
                    }
                    _ => {}
                }
            }
            _ => {}
        }

        bail!(ConstraintConversionError {
            kind: ConstraintConversionErrorKind::UnknownLhsForContains(lhs.clone()),
        })
    }

    fn visit_contains_all(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                // We expect the lhs to be a resource variable.
                ResourceVariableVisitor.visit_expr(&expr)?;

                match attr.as_str() {
                    "entity_types" => {
                        return Ok(PolicyConstraint::IsAllTypes {
                            entity_types: ExpressionSetVisitor(EntityTypeIdVisitor)
                                .visit_expr(rhs)
                                .change_context_lazy(|| ConstraintConversionError {
                                    kind: ConstraintConversionErrorKind::UnknownRhsForContains(
                                        rhs.clone(),
                                    ),
                                })?,
                        });
                    }
                    _ => {}
                }
            }
            _ => {}
        }

        bail!(ConstraintConversionError {
            kind: ConstraintConversionErrorKind::UnknownLhsForContains(lhs.clone()),
        })
    }

    fn visit_contains_any(
        &self,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self::Value, Report<Self::Error>> {
        match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                // We expect the lhs to be a resource variable.
                ResourceVariableVisitor.visit_expr(&expr)?;

                match attr.as_str() {
                    "entity_types" => {
                        return Ok(PolicyConstraint::IsAnyType {
                            entity_types: ExpressionSetVisitor(EntityTypeIdVisitor)
                                .visit_expr(rhs)
                                .change_context_lazy(|| ConstraintConversionError {
                                    kind: ConstraintConversionErrorKind::UnknownRhsForContains(
                                        rhs.clone(),
                                    ),
                                })?,
                        });
                    }
                    _ => {}
                }
            }
            _ => {}
        }

        bail!(ConstraintConversionError {
            kind: ConstraintConversionErrorKind::UnknownLhsForContains(lhs.clone()),
        })
    }
}

impl PolicyConstraint {
    fn try_from_cedar_binary(
        op: ast::BinaryOp,
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self, Report<ConstraintConversionError>> {
        match op {
            ast::BinaryOp::Eq => Self::try_from_cedar_eq(lhs, rhs),
            ast::BinaryOp::In => Self::try_from_cedar_in(lhs, rhs),
            _ => bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownBinaryOp(op),
            }),
        }
    }

    fn try_from_cedar_eq_exact(
        expr: &ast::Expr,
    ) -> Result<Self, Report<ConstraintConversionError>> {
        let ast::ExprKind::Lit(ast::Literal::EntityUID(euid)) = expr.expr_kind() else {
            bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownRhsForEq(expr.clone()),
            });
        };

        if *euid.entity_type() == **EntityUuid::entity_type() {
            Ok(Self::IsEntity {
                id: Some(EntityUuid::from_eid(euid.eid()).change_context_lazy(|| {
                    ConstraintConversionError {
                        kind: ConstraintConversionErrorKind::UnknownRhsForEq(expr.clone()),
                    }
                })?),
            })
        } else if *euid.entity_type() == **EntityTypeId::entity_type() {
            Ok(Self::IsEntityType {
                id: Some(
                    EntityTypeId::from_eid(euid.eid())
                        .change_context_lazy(|| ConstraintConversionError {
                            kind: ConstraintConversionErrorKind::UnknownRhsForEq(expr.clone()),
                        })?
                        .into_url(),
                ),
            })
        } else {
            bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownRhsForEq(expr.clone()),
            });
        }
    }

    fn try_from_cedar_eq(
        lhs: &ast::Expr,
        rhs: &ast::Expr,
    ) -> Result<Self, Report<ConstraintConversionError>> {
        if Self::is_resource_expr(lhs) {
            return Self::try_from_cedar_eq_exact(rhs);
        }

        match lhs.expr_kind() {
            ast::ExprKind::GetAttr { expr, attr } => {
                if Self::is_resource_expr(expr) {
                    match attr.as_str() {
                        "base_url" => {
                            return Self::try_from_cedar_has_base_url(rhs);
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }

        bail!(ConstraintConversionError {
            kind: ConstraintConversionErrorKind::UnknownLhsForEq(rhs.clone()),
        });
    }

    fn try_from_cedar_has_base_url(
        expr: &ast::Expr,
    ) -> Result<Self, Report<ConstraintConversionError>> {
        let ast::ExprKind::Lit(ast::Literal::String(base_url)) = expr.expr_kind() else {
            bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownRhsForContains(expr.clone()),
            });
        };

        Ok(Self::IsBaseUrl {
            base_url: BaseUrl::new(base_url.to_string()).change_context_lazy(|| {
                ConstraintConversionError {
                    kind: ConstraintConversionErrorKind::UnknownRhsForContains(expr.clone()),
                }
            })?,
        })
    }

    fn try_from_cedar_in(
        resource: &ast::Expr,
        expr: &ast::Expr,
    ) -> Result<Self, Report<ConstraintConversionError>> {
        if !Self::is_resource_expr(resource) {
            bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownLhsForIn(resource.clone()),
            });
        }

        let ast::ExprKind::Lit(ast::Literal::EntityUID(euid)) = expr.expr_kind() else {
            bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownRhsForIn(expr.clone()),
            });
        };

        Ok(Self::InWeb {
            web: OwnedById::from_euid(euid).change_context_lazy(|| ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownRhsForIn(expr.clone()),
            })?,
        })
    }

    fn try_from_cedar_is(
        expr: &ast::Expr,
        entity_type: &ast::EntityType,
    ) -> Result<Self, Report<ConstraintConversionError>> {
        if !Self::is_resource_expr(expr) {
            bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownExprForIs(expr.clone()),
            });
        }

        if *entity_type == **EntityTypeId::entity_type() {
            Ok(Self::IsEntityType { id: None })
        } else if *entity_type == **EntityUuid::entity_type() {
            Ok(Self::IsEntity { id: None })
        } else {
            bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownEntityTypeForIs(entity_type.clone()),
            });
        }
    }

    pub(crate) fn try_from_cedar(
        expr: &ast::Expr,
    ) -> Result<Self, Report<ConstraintConversionError>> {
        match expr.expr_kind() {
            ast::ExprKind::Lit(literal) => Self::try_from_cedar_literal(literal),
            ast::ExprKind::And { left, right } => Self::try_from_cedar_and(left, right),
            ast::ExprKind::Or { left, right } => Self::try_from_cedar_or(left, right),
            ast::ExprKind::UnaryApp { op, arg } => Self::try_from_cedar_unary(*op, arg),
            ast::ExprKind::BinaryApp { op, arg1, arg2 } => {
                Self::try_from_cedar_binary(*op, arg1, arg2)
            }
            ast::ExprKind::Is { expr, entity_type } => Self::try_from_cedar_is(expr, entity_type),
            _ => bail!(ConstraintConversionError {
                kind: ConstraintConversionErrorKind::UnknownExpr(expr.clone()),
            }),
        }
        .change_context(ConstraintConversionError {
            kind: ConstraintConversionErrorKind::UnknownExpr(expr.clone()),
        })
    }

    fn display(&self, fmt: &mut fmt::Formatter<'_>, indent: usize) -> fmt::Result {
        match self {
            Self::All { filters } => {
                if filters.is_empty() {
                    fmt.write_str("true")
                } else {
                    fmt.write_str("all:")?;
                    for filter in filters {
                        writeln!(fmt)?;
                        fmt.write_str(&" ".repeat(indent + 1))?;
                        fmt.write_str("- ")?;
                        filter.display(fmt, indent + 2)?;
                    }
                    Ok(())
                }
            }
            Self::Any { filters } => {
                if filters.is_empty() {
                    fmt.write_str("false")
                } else {
                    fmt.write_str("any:")?;
                    for filter in filters {
                        writeln!(fmt)?;
                        fmt.write_str(&" ".repeat(indent + 1))?;
                        fmt.write_str("- ")?;
                        filter.display(fmt, indent + 2)?;
                    }
                    Ok(())
                }
            }
            Self::Not { filter } => {
                fmt.write_str("not ")?;
                filter.display(fmt, indent)
            }
            Self::IsBaseUrl { base_url } => write!(fmt, "is_base_url({base_url})"),
            Self::IsVersion { version } => write!(fmt, "is_version({})", version.inner()),
            Self::IsOfType { entity_type } => write!(fmt, "is_of_type({entity_type})"),
            Self::IsAllTypes { entity_types } => write!(
                fmt,
                "is_all_types({})",
                entity_types
                    .iter()
                    .map(VersionedUrl::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Self::IsAnyType { entity_types } => write!(
                fmt,
                "is_any_type({})",
                entity_types
                    .iter()
                    .map(VersionedUrl::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Self::IsEntity { id: None } => write!(fmt, "is_entity()"),
            Self::IsEntityType { id: None } => write!(fmt, "is_entity_type()"),
            Self::IsEntity { id: Some(id) } => write!(fmt, "is_entity({id})"),
            Self::IsEntityType { id: Some(id) } => write!(fmt, "is_entity_type({id})"),
            Self::InWeb { web } => write!(fmt, "in_web({web})"),
        }
    }
}

impl fmt::Display for PolicyConstraint {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.display(fmt, 0)
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("policy constraint error")]
pub struct PolicyConstraintError;

#[derive(Debug)]
pub enum Authorized {
    Always,
    Never,
    Partial(PolicyConstraint),
}

impl PolicySet {
    /// Adds a list of policies to the policy set.
    ///
    /// # Errors
    ///
    /// Returns an error if the policy is not valid.
    pub fn with_policies<'p>(
        mut self,
        policies: impl IntoIterator<Item = &'p Policy>,
    ) -> Result<Self, Report<PolicySetInsertionError>> {
        for policy in policies {
            self.add_policy(policy)?;
        }
        Ok(self)
    }

    /// Adds a policy to the policy set.
    ///
    /// # Errors
    ///
    /// Returns an error if the policy is not valid.
    pub fn with_policy(mut self, policy: &Policy) -> Result<Self, Report<PolicySetInsertionError>> {
        self.policies
            .add_static(
                policy
                    .to_cedar_static_policy()
                    .change_context(PolicySetInsertionError)?,
            )
            .change_context(PolicySetInsertionError)?;
        Ok(self)
    }

    /// Adds a policy to the policy set.
    ///
    /// # Errors
    ///
    /// Returns an error if the policy is not valid.
    pub fn add_policy(&mut self, policy: &Policy) -> Result<(), Report<PolicySetInsertionError>> {
        self.policies
            .add_static(
                policy
                    .to_cedar_static_policy()
                    .change_context(PolicySetInsertionError)?,
            )
            .change_context(PolicySetInsertionError)?;
        Ok(())
    }

    /// Adds a template to the policy set.
    ///
    /// # Errors
    ///
    /// Returns an error if the template is not valid.
    pub fn add_template(&mut self, policy: &Policy) -> Result<(), Report<PolicySetInsertionError>> {
        self.policies
            .add_template(policy.to_cedar_template())
            .change_context(PolicySetInsertionError)?;
        Ok(())
    }

    pub(crate) const fn policies(&self) -> &ast::PolicySet {
        &self.policies
    }

    /// Evaluates the policy set for the given request.
    ///
    /// # Errors
    ///
    /// Returns an error if the evaluation fails.
    pub fn evaluate(
        &self,
        request: &Request,
        context: &Context,
    ) -> Result<Authorized, Report<PolicyEvaluationError>> {
        let authorizer = Authorizer::new();

        let response =
            authorizer.is_authorized_core(request.to_cedar(), self.policies(), context.entities());

        let decision = response.decision();

        response
            .errors
            .into_iter()
            .map(|error| Err(Report::new(error)))
            .try_collect_reports::<()>()
            .change_context(PolicyEvaluationError)?;

        if let Some(decision) = decision {
            return Ok(match decision {
                Decision::Allow => Authorized::Always,
                Decision::Deny => Authorized::Never,
            });
        }

        let forbids = response
            .residual_forbids
            .values()
            .map(|(expr, _)| (**expr).clone())
            .fold(ast::Expr::val(true), |acc, expr| {
                if acc == ast::Expr::val(true) {
                    ast::Expr::not(expr)
                } else {
                    ast::Expr::and(acc, ast::Expr::not(expr))
                }
            });
        let permits = response
            .residual_permits
            .values()
            .map(|(expr, _)| (**expr).clone())
            .fold(ast::Expr::val(false), |acc, expr| {
                if acc == ast::Expr::val(false) {
                    expr
                } else {
                    ast::Expr::or(acc, expr)
                }
            });

        Ok(Authorized::Partial(
            PolicyConstraint::try_from_cedar(&ast::Expr::and(forbids, permits))
                .change_context(PolicyEvaluationError)?,
        ))
    }
}
