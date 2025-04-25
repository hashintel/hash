use bitvec::bitbox;
use ena::unify::{InPlaceUnificationTable, NoError};
use hashbrown::HashMap;

use super::{Constraint, Variable, VariableId, tarjan::Tarjan};
use crate::r#type::environment::Environment;

pub(crate) struct Unification {
    table: InPlaceUnificationTable<VariableId>,

    variables: Vec<Variable>,
    lookup: HashMap<Variable, VariableId, foldhash::fast::RandomState>,
}

impl Unification {
    pub(crate) fn new() -> Self {
        Self {
            table: InPlaceUnificationTable::new(),
            variables: Vec::new(),
            lookup: HashMap::default(),
        }
    }

    pub(crate) fn upsert_variable(&mut self, variable: Variable) -> VariableId {
        *self.lookup.entry(variable).or_insert_with_key(|&key| {
            let id = self.table.new_key(());
            self.variables.push(key);
            id
        })
    }

    pub(crate) fn unify(&mut self, lhs: Variable, rhs: Variable) {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table
            .unify_var_var(lhs, rhs)
            .unwrap_or_else(|_: NoError| unreachable!());
    }

    pub(crate) fn is_unionied(&mut self, lhs: Variable, rhs: Variable) -> bool {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table.unioned(lhs, rhs)
    }

    pub(crate) fn root(&mut self, variable: Variable) -> VariableId {
        let id = self.upsert_variable(variable);

        self.table.find(id)
    }
}

struct InferenceSolver<'env, 'heap> {
    environment: &'env Environment<'heap>,
    constraints: Vec<Constraint>,
    unification: Unification,
}

impl<'env, 'heap> InferenceSolver<'env, 'heap> {
    fn solve_anti_symmetry(&mut self) {
        // We first create a graph of all the inference variables, that's then used to see if there
        // are any variables that can be equalized.
        // We can do this because our type lattice is a partially ordered set, this means that
        // anti-symmetry applies.
        // Given `A <: B`, and `B <: A`, we can infer that `A ≡ B`.
        let variables = self.unification.variables.len();

        // Our graph is a simple adjacency list, where each slot corresponds to a variable,
        // variables that have been unified simply have no connections.
        let mut graph = Vec::with_capacity(variables);
        graph.resize(variables, bitbox![0; variables]);

        for &constraint in &self.constraints {
            let Constraint::Ordering { lower, upper } = constraint else {
                continue;
            };

            // We don't really care in which direction we record the constraints (as they're only
            // used to find the connected component) but they should be consistent. In
            // our case, we record the subtype relationship, e.g. `lower is a subtype of upper`,
            // therefore `lower -> upper`.

            // We also need to make sure that we only use the root keys from the variables,
            // otherwise we might not catch every strongly connected component.
            let lower = self.unification.root(lower);
            let upper = self.unification.root(upper);
            graph[lower.0 as usize].set(upper.0 as usize, true);
        }

        let tarjan = Tarjan::new(&graph);

        for scc in tarjan.compute() {
            for [lhs, rhs] in scc.iter_ones().map_windows(|values: &[_; 2]| *values) {
                let lhs = self.unification.variables[lhs];
                let rhs = self.unification.variables[rhs];

                self.unification.unify(lhs, rhs);
            }
        }
    }

    fn solve_constraints(&mut self) {}

    pub fn solve(mut self) {
        self.solve_anti_symmetry();
    }
}
