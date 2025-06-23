use core::fmt;

use cedar_policy_core::{
    ast,
    authorizer::{Authorizer, Decision},
};
use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};

use super::{Context, Policy, Request};

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
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("policy constraint error")]
pub struct PolicyConstraintError;

#[derive(Debug)]
pub enum Authorized {
    Always,
    Never,
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
            authorizer.is_authorized(request.to_cedar(), self.policies(), context.entities());

        response
            .diagnostics
            .errors
            .into_iter()
            .map(|error| Err(Report::new(error)))
            .try_collect_reports::<()>()
            .change_context(PolicyEvaluationError)?;

        Ok(match response.decision {
            Decision::Allow => Authorized::Always,
            Decision::Deny => Authorized::Never,
        })
    }
}
