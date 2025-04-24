use ena::unify::{InPlaceUnificationTable, NoError, UnifyKey};
use hashbrown::HashMap;

use super::{Environment, Variance};
use crate::r#type::{
    infer::{Constraint, Variable},
    recursion::RecursionBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
struct VariableId(u32);

impl UnifyKey for VariableId {
    type Value = ();

    fn index(&self) -> u32 {
        self.0
    }

    fn from_index(u: u32) -> Self {
        Self(u)
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

    pub fn add_constraint(&mut self, constraint: Constraint) {
        for variable in constraint.variables() {
            // Ensure that each mentioned variable is registered in the unification table
            self.unification.upsert_variable(variable);
        }

        // Instead of registering a constraint, in invariant contexts we simply unify the variables
        if self.variance == Variance::Invariant
            && let Constraint::Ordering { lower, upper } = constraint
        {
            self.unification.unify(lower, upper);
            return;
        }

        self.constraints.push(constraint);
    }
}
