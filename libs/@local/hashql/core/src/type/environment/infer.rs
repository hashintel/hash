use core::ops::Deref;

use super::{Environment, Variance};
use crate::{
    span::SpanId,
    symbol::Ident,
    r#type::{
        TypeId,
        inference::{
            Constraint, DeferralDepth, Inference as _, InferenceSolver, ResolutionStrategy,
            SelectionConstraint, Subject, Variable, VariableDependencyCollector, VariableKind,
        },
        recursion::RecursionBoundary,
    },
};

#[derive(Debug)]
pub struct InferenceEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    boundary: RecursionBoundary<'heap>,
    variables: VariableDependencyCollector<'env, 'heap>,

    pub constraints: Vec<Constraint<'heap>>,

    variance: Variance,
}

impl<'env, 'heap> InferenceEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            variables: VariableDependencyCollector::new(environment),
            constraints: Vec::new(),
            variance: Variance::default(),
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

    pub fn add_constraint(&mut self, mut constraint: Constraint<'heap>) {
        #[expect(clippy::match_same_arms, reason = "readability")]
        if self.variance == Variance::Invariant {
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

    #[must_use]
    pub fn fresh_hole(&self, span: SpanId) -> Variable {
        let hole = self.counter.hole.next();

        Variable {
            span,
            kind: VariableKind::Hole(hole),
        }
    }

    pub fn collect_constraints(&mut self, subtype: TypeId, supertype: TypeId) {
        #[expect(
            clippy::match_same_arms,
            reason = "explicit to document why invariant is covariant in disguise"
        )]
        let (subtype, supertype) = match self.variance {
            Variance::Covariant => (subtype, supertype),
            Variance::Contravariant => (supertype, subtype),
            // The same subtype relationship, but `add_constraint` changes what's registered
            Variance::Invariant => (subtype, supertype),
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

    pub(crate) fn with_variance<T>(
        &mut self,
        variance: Variance,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let old_variance = self.variance;

        self.variance = old_variance.transition(variance);

        let result = closure(self);
        self.variance = old_variance;
        result
    }

    pub fn in_contravariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Contravariant, closure)
    }

    pub fn in_covariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Covariant, closure)
    }

    pub fn in_invariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Invariant, closure)
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
