use core::ops::Deref;

use super::{
    Environment, Variance,
    context::variance::{VarianceFlow, VarianceState},
};
use crate::{
    span::SpanId,
    symbol::Ident,
    r#type::{
        TypeId,
        inference::{
            Constraint, DeferralDepth, Inference as _, InferenceSolver, ResolutionStrategy,
            SelectionConstraint, Subject, Variable, VariableDependencyCollector,
            VariableDependencyCollectorSkeleton, VariableKind,
        },
        recursion::RecursionBoundary,
    },
};

#[derive(Debug)]
#[expect(
    dead_code,
    reason = "used during benchmarking to delay signficiant drop"
)]
pub struct InferenceEnvironmentSkeleton<'heap> {
    boundary: RecursionBoundary<'heap>,
    variables: VariableDependencyCollectorSkeleton<'heap>,
    constraints: Vec<Constraint<'heap>>,
    variance: VarianceState,
}

#[derive(Debug)]
pub struct InferenceEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    boundary: RecursionBoundary<'heap>,
    variables: VariableDependencyCollector<'env, 'heap>,

    pub constraints: Vec<Constraint<'heap>>,

    variance: VarianceState,
}

impl<'env, 'heap> InferenceEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            variables: VariableDependencyCollector::new(environment),
            constraints: Vec::new(),
            variance: VarianceState::new(Variance::Covariant),
        }
    }

    #[must_use]
    pub fn into_skeleton(self) -> InferenceEnvironmentSkeleton<'heap> {
        InferenceEnvironmentSkeleton {
            boundary: self.boundary,
            variables: self.variables.into_skeleton(),
            constraints: self.constraints,
            variance: self.variance,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_constraints(
        mut self,
        constraints: impl IntoIterator<Item = Constraint<'heap>>,
    ) -> Self {
        self.constraints.extend(constraints);
        self
    }

    pub(crate) fn drain_constraints_into(&mut self, target: &mut Vec<Constraint<'heap>>) {
        target.append(&mut self.constraints);
    }

    pub(crate) const fn has_constraints(&self) -> bool {
        !self.constraints.is_empty()
    }

    pub(crate) fn take_constraints(&mut self) -> Vec<Constraint<'heap>> {
        core::mem::take(&mut self.constraints)
    }

    pub(crate) fn is_invariant(&self) -> bool {
        self.variance.get() == Variance::Invariant
    }

    pub fn add_constraint(&mut self, mut constraint: Constraint<'heap>) {
        #[expect(clippy::match_same_arms, reason = "readability")]
        if self.variance.get() == Variance::Invariant {
            constraint = match constraint {
                Constraint::Unify { .. } => constraint,
                Constraint::UpperBound { variable, bound }
                | Constraint::LowerBound { variable, bound } => Constraint::Equals {
                    variable,
                    r#type: bound,
                },
                Constraint::Equals {
                    variable: _,
                    r#type: _,
                } => constraint,
                Constraint::Ordering { lower, upper } => Constraint::Unify {
                    lhs: lower,
                    rhs: upper,
                },
                // dependencies are unaffected by variance
                Constraint::Dependency { .. } => constraint,
                // Nothing happens when we have a selection constraint, as selection constraints are
                // deferred constraints
                Constraint::Selection(..) => constraint,
            };
        }

        self.constraints.push(constraint);
    }

    pub fn add_dependency(&mut self, variable: Variable, other: Variable) {
        let constraint = Constraint::Dependency {
            source: variable,
            target: other,
        };

        self.constraints.push(constraint);
    }

    pub fn add_projection(
        &mut self,
        span: SpanId,
        r#type: TypeId,
        field: Ident<'heap>,
    ) -> Variable {
        let hole = self.counter.hole.next();
        let variable = Variable {
            span,
            kind: VariableKind::Hole(hole),
        };

        let projection = SelectionConstraint::Projection {
            subject: Subject::Type(r#type),
            field,
            output: variable,
        };
        self.constraints.push(Constraint::Selection(
            projection,
            ResolutionStrategy::default(),
            DeferralDepth::default(),
        ));

        variable
    }

    pub fn add_subscript(&mut self, span: SpanId, r#type: TypeId, index: TypeId) -> Variable {
        let hole = self.counter.hole.next();
        let variable = Variable {
            span,
            kind: VariableKind::Hole(hole),
        };

        let subscript = SelectionConstraint::Subscript {
            subject: Subject::Type(r#type),
            index: Subject::Type(index),
            output: variable,
        };
        self.constraints.push(Constraint::Selection(
            subscript,
            ResolutionStrategy::default(),
            DeferralDepth::default(),
        ));

        variable
    }

    pub fn add_variables(&mut self, variables: impl IntoIterator<Item = Variable>) {
        // This acts like registering variables, because we unify each variable with themselves,
        // therefore adding the node, but no edges.
        self.constraints
            .extend(variables.into_iter().map(|variable| Constraint::Unify {
                lhs: variable,
                rhs: variable,
            }));
    }

    #[must_use]
    pub fn fresh_hole(&self, span: SpanId) -> Variable {
        let hole = self.counter.hole.next();

        Variable {
            span,
            kind: VariableKind::Hole(hole),
        }
    }

    pub fn collect_constraints(&mut self, variance: Variance, subtype: TypeId, supertype: TypeId) {
        let (_guard, variance_flow) = self.variance.transition(variance);

        #[expect(
            clippy::match_same_arms,
            reason = "explicit to document why invariant is covariant in disguise"
        )]
        let (subtype, supertype) = match variance_flow {
            VarianceFlow::Forward => (subtype, supertype),
            VarianceFlow::Reverse => (supertype, subtype),
            // The same subtype relationship, but `add_constraint` changes what's registered
            VarianceFlow::Invariant => (subtype, supertype),
        };

        let subtype = self.environment.r#type(subtype);
        let supertype = self.environment.r#type(supertype);

        if self.boundary.enter(subtype, supertype).is_break() {
            // In a recursive type, we've already collected the constraints once, so can simply
            // terminate
            return;
        }

        subtype.collect_constraints(supertype, self);

        self.boundary.exit(subtype, supertype);
    }

    pub fn collect_dependencies(&mut self, id: TypeId, variable: Variable) {
        let r#type = self.environment.r#type(id);

        for depends_on in self.variables.collect(r#type) {
            self.constraints.push(Constraint::Dependency {
                source: variable,
                target: depends_on,
            });
        }
    }

    #[must_use]
    pub fn into_solver(self) -> InferenceSolver<'env, 'heap> {
        InferenceSolver::new(self)
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for InferenceEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}
