use core::ops::Deref;

use ena::unify::{InPlaceUnificationTable, NoError, UnifyKey};
use hashbrown::HashMap;

use super::{Environment, Variance};
use crate::r#type::{
    TypeId,
    infer::{Constraint, Inference as _, Variable},
    recursion::RecursionBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
struct VariableId(u32);

impl UnifyKey for VariableId {
    type Value = ();

    fn index(&self) -> u32 {
        self.0
    }

    #[expect(clippy::renamed_function_params)]
    fn from_index(index: u32) -> Self {
        Self(index)
    }

    fn tag() -> &'static str {
        "VariableId"
    }
}

pub struct Unification {
    table: InPlaceUnificationTable<VariableId>,

    variable_by_id: Vec<Variable>,
    id_by_variable: HashMap<Variable, VariableId, foldhash::fast::RandomState>,
}

impl Unification {
    fn new() -> Self {
        Self {
            table: InPlaceUnificationTable::new(),
            variable_by_id: Vec::new(),
            id_by_variable: HashMap::default(),
        }
    }

    fn upsert_variable(&mut self, variable: Variable) -> VariableId {
        *self
            .id_by_variable
            .entry(variable)
            .or_insert_with_key(|&key| {
                let id = self.table.new_key(());
                self.variable_by_id.push(key);
                id
            })
    }

    fn unify(&mut self, lhs: Variable, rhs: Variable) {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table
            .unify_var_var(lhs, rhs)
            .unwrap_or_else(|_: NoError| unreachable!());
    }

    fn unioned(&mut self, lhs: Variable, rhs: Variable) -> bool {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table.unioned(lhs, rhs)
    }
}

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
        self.unification.unioned(lhs, rhs)
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
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for InferenceEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}
