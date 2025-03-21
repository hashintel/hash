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
    Context, PartialResourceId, Policy, Request,
    cedar::FromCedarExpr,
    resource::{EntityResourceFilter, EntityTypeResourceFilter},
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

#[derive(Debug)]
pub enum PolicyConstraint {
    Entity(EntityResourceFilter),
    EntityType(EntityTypeResourceFilter),
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

        let expr = ast::Expr::and(forbids, permits);
        let constraint = match request.resource {
            Some(PartialResourceId::Entity(None)) => PolicyConstraint::Entity(
                EntityResourceFilter::from_cedar(&expr).change_context(PolicyEvaluationError)?,
            ),
            Some(PartialResourceId::EntityType(None)) => PolicyConstraint::EntityType(
                EntityTypeResourceFilter::from_cedar(&expr)
                    .change_context(PolicyEvaluationError)?,
            ),
            _ => todo!(),
        };

        Ok(Authorized::Partial(constraint))
        // Ok(Authorized::Partial(
        //     PolicyConstraint::try_from_cedar(&ast::Expr::and(forbids, permits))
        //         .change_context(PolicyEvaluationError)?,
        // ))
    }
}
