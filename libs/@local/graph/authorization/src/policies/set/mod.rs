use core::fmt;
use std::collections::HashSet;

use cedar_policy_core::{
    ast,
    authorizer::{Authorizer, Decision},
};
use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};

use super::{Context, Policy, Request, ResolvedPolicy, action::ActionName};

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("policy set insertion failed")]
pub struct PolicySetInsertionError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("policy set evaluation failed")]
pub struct PolicyEvaluationError;

#[derive(Default)]
pub struct PolicySet {
    policies: ast::PolicySet,
    tracked_actions: HashSet<ActionName>,
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
    /// Sets the tracked actions for the policy set.
    ///
    /// The policy set will fail to evaluate requests with actions that are not in this set.
    #[must_use]
    pub fn with_tracked_actions(mut self, actions: HashSet<ActionName>) -> Self {
        self.tracked_actions = actions;
        self
    }

    /// Adds a list of policies to the policy set.
    ///
    /// # Errors
    ///
    /// Returns an error if the policy is not valid.
    pub fn with_policies<'p>(
        mut self,
        policies: impl IntoIterator<Item = &'p ResolvedPolicy>,
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
    pub fn add_policy(
        &mut self,
        policy: &ResolvedPolicy,
    ) -> Result<(), Report<PolicySetInsertionError>> {
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
        const STACK_SIZE_RED_ZONE: usize = 1024 * 1024; // 1 MiB
        const STACK_SIZE_ALLOC: usize = 32 * 1024 * 1024; // 32 MiB

        if !self.tracked_actions.contains(&request.action) {
            return Err(Report::new(PolicyEvaluationError).attach(format!(
                "Action `{}` is not tracked and cannot be evaluated",
                request.action
            )));
        }

        let authorizer = Authorizer::new();

        let response = stacker::maybe_grow(STACK_SIZE_RED_ZONE, STACK_SIZE_ALLOC, || {
            authorizer.is_authorized(request.to_cedar(), self.policies(), context.entities())
        });

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
