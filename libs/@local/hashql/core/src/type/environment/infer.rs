use core::ops::Deref;

use super::{Environment, Variance};
use crate::{
    span::SpanId,
    symbol::Ident,
    r#type::{
        TypeId,
        inference::{
            Constraint, Inference as _, InferenceSolver, PartialStructuralEdge,
            SelectionConstraint, Subject, Variable, VariableKind, solver::Unification,
        },
        recursion::RecursionBoundary,
    },
};

#[derive(Debug)]
pub struct InferenceEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    boundary: RecursionBoundary<'heap>,

    constraints: Vec<Constraint<'heap>>,
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

    pub fn take_constraints(&mut self) -> Vec<Constraint<'heap>> {
        core::mem::take(&mut self.constraints)
    }

    pub fn is_unioned(&mut self, lhs: VariableKind, rhs: VariableKind) -> bool {
        self.unification.is_unioned(lhs, rhs)
    }

    pub fn add_constraint(&mut self, mut constraint: Constraint<'heap>) {
        for variable in constraint.variables() {
            // Ensure that each mentioned variable is registered in the unification table
            self.unification.upsert_variable(variable.kind);
        }

        #[expect(clippy::match_same_arms, reason = "readability")]
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
                    self.unification.unify(lower.kind, upper.kind);
                    return;
                }
                Constraint::StructuralEdge {
                    source: _,
                    target: _,
                } => {
                    // Do not install any structural edges, as they would violate the invariant
                    // variance.
                    // `(name: _2) = _1` does not mean that `_2` is equal to `_1`.
                    return;
                }
                // Nothing happens when we have a selection constraint, as selection constraints are
                // deferred constraints
                Constraint::Selection(_) => constraint,
            };
        }

        self.constraints.push(constraint);
    }

    pub fn add_structural_edge(&mut self, variable: PartialStructuralEdge, other: Variable) {
        let constraint = match variable {
            PartialStructuralEdge::Source(source) => Constraint::StructuralEdge {
                source,
                target: other,
            },
            PartialStructuralEdge::Target(target) => Constraint::StructuralEdge {
                source: other,
                target,
            },
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
        self.constraints.push(Constraint::Selection(projection));

        variable
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

    pub fn collect_structural_edges(&mut self, id: TypeId, variable: PartialStructuralEdge) {
        let variable = match self.variance {
            Variance::Covariant => variable,
            Variance::Contravariant => variable.invert(),
            // We cannot safely collect structural edges for invariant types
            Variance::Invariant => return,
        };

        let r#type = self.environment.r#type(id);

        if self.boundary.enter(r#type, r#type).is_break() {
            // In a recursive type, we've already collected the constraints once, so can simply
            // terminate
            return;
        }

        r#type.collect_structural_edges(variable, self);

        self.boundary.exit(r#type, r#type);
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
