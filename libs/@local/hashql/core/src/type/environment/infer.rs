use core::ops::Deref;

use super::{Environment, Variance};
use crate::r#type::{
    TypeId,
    inference::{Constraint, Inference as _, InferenceSolver, Variable, solver::Unification},
    recursion::RecursionBoundary,
};

pub struct InferenceEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    boundary: RecursionBoundary,

    constraints: Vec<Constraint>,
    unification: Unification,

    variance: Variance,
}

impl<'env, 'heap> InferenceEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            constraints: Vec::new(),
            unification: Unification::new(),
            variance: Variance::default(),
        }
    }

    pub fn take_constraints(&mut self) -> Vec<Constraint> {
        core::mem::take(&mut self.constraints)
    }

    pub fn is_unioned(&mut self, lhs: Variable, rhs: Variable) -> bool {
        self.unification.is_unionied(lhs, rhs)
    }

    pub fn add_constraint(&mut self, mut constraint: Constraint) {
        for variable in constraint.variables() {
            // Ensure that each mentioned variable is registered in the unification table
            self.unification.upsert_variable(variable);
        }

        if self.variance == Variance::Invariant {
            constraint = match constraint {
                Constraint::UpperBound { variable, bound }
                | Constraint::LowerBound { variable, bound } => Constraint::Equals {
                    variable,
                    r#type: bound,
                },
                Constraint::Equals {
                    variable: _,
                    r#type: _,
                } => constraint,
                Constraint::Ordering { lower, upper } => {
                    self.unification.unify(lower, upper);
                    return;
                }
            };
        }

        self.constraints.push(constraint);
    }

    pub fn collect_constraints(&mut self, subtype: TypeId, supertype: TypeId) {
        if !self.boundary.enter(subtype, supertype) {
            // In a recursive type, we've already collected the constraints once, so can simply
            // terminate
            return;
        }

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

        let subtype = self.environment.types[subtype].copied();
        let supertype = self.environment.types[supertype].copied();

        subtype.collect_constraints(supertype, self);

        self.boundary.exit(subtype.id, supertype.id);
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

    pub(crate) fn in_contravariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Contravariant, closure)
    }

    pub(crate) fn in_covariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Covariant, closure)
    }

    pub(crate) fn in_invariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Invariant, closure)
    }

    #[must_use]
    pub fn into_solver(self) -> InferenceSolver<'env, 'heap> {
        InferenceSolver::new(self.environment, self.unification, self.constraints)
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
