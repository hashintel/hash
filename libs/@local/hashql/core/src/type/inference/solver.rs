use bitvec::bitbox;
use ena::unify::{InPlaceUnificationTable, NoError};
use hashbrown::HashMap;

use super::{Constraint, Variable, VariableId, tarjan::Tarjan};
use crate::r#type::{
    TypeId,
    environment::{AnalysisEnvironment, Environment, LatticeEnvironment, Substitution},
};

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
            debug_assert_eq!(id.0 as usize, self.variables.len());

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

    fn root_id(&mut self, variable: Variable) -> VariableId {
        let id = self.upsert_variable(variable);

        self.table.find(id)
    }

    fn root(&mut self, variable: Variable) -> Variable {
        let id = self.root_id(variable);

        self.variables[id.0 as usize]
    }
}

#[derive(Debug, Default)]
struct VariableConstraint {
    equal: Option<TypeId>,
    lower: Option<TypeId>,
    upper: Option<TypeId>,
}

struct InferenceSolver<'env, 'heap> {
    environment: &'env Environment<'heap>,
    lattice: LatticeEnvironment<'env, 'heap>,

    constraints: Vec<Constraint>,
    unification: Unification,
}

impl<'env, 'heap> InferenceSolver<'env, 'heap> {
    fn solve_anti_symmetry(&mut self) {
        // We first create a graph of all the inference variables, that's then used to see if there
        // are any variables that can be equalized.
        // We can do this because our type lattice is a partially ordered set, this we can make use
        // of it's anti-symmetric properties.
        // Given `A <: B`, and `B <: A`, we can infer that `A ≡ B`.
        let variables = self.unification.variables.len();

        // Our graph is a simple adjacency list, where each slot corresponds to a variable,
        // variables that have been already been unified simply have no connections.
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
            let lower = self.unification.root_id(lower);
            let upper = self.unification.root_id(upper);
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

    fn apply_constraints(
        &mut self,
    ) -> HashMap<Variable, VariableConstraint, foldhash::fast::RandomState> {
        let mut constraints = HashMap::default();

        for &constraint in &self.constraints {
            match constraint {
                Constraint::UpperBound { variable, bound } => {
                    let root = self.unification.root(variable);
                    let entry: &mut VariableConstraint = constraints.entry(root).or_default();

                    match entry.upper {
                        None => {
                            entry.upper = Some(bound);
                        }
                        Some(existing) => entry.upper = Some(self.lattice.join(existing, bound)),
                    }
                }
                Constraint::LowerBound { variable, bound } => {
                    let root = self.unification.root(variable);
                    let entry = constraints.entry(root).or_default();

                    match entry.lower {
                        None => {
                            entry.lower = Some(bound);
                        }
                        Some(existing) => entry.lower = Some(self.lattice.meet(existing, bound)),
                    }
                }
                Constraint::Equals { variable, r#type } => {
                    // TODO: in the is_equivalent check we need to check if they are equal, as in
                    // they refer to the same variable
                    let root = self.unification.root(variable);
                    let entry = constraints.entry(root).or_default();

                    match entry.equal {
                        None => {
                            entry.equal = Some(r#type);
                        }
                        Some(existing) if self.lattice.is_equivalent(existing, r#type) => {
                            // do nothing, this is fine
                        }
                        Some(_) => {
                            todo!("issue diagnostic");
                        }
                    }
                }
                // solved prior in anti-symmetry pass
                Constraint::Ordering { .. } => {}
            }
        }

        constraints
    }

    fn solve_constraints(
        &mut self,
        constraints: HashMap<Variable, VariableConstraint, foldhash::fast::RandomState>,
    ) -> HashMap<Variable, TypeId, foldhash::fast::RandomState> {
        let mut substitutions = HashMap::default();

        for (variable, constraint) in constraints {
            if let VariableConstraint {
                equal: _,
                lower: Some(lower),
                upper: Some(upper),
            } = constraint
                && !self.lattice.is_subtype_of(lower, upper)
            {
                todo!("issue diagnostic")
            }

            match constraint {
                // If there's no constraint, we can't infer anything
                VariableConstraint {
                    equal: None,
                    lower: None,
                    upper: None,
                } => {
                    todo!("issue diagnostic")
                }
                // in case there's a single constraint we can simply just use that type
                VariableConstraint {
                    equal: Some(constraint),
                    lower: None,
                    upper: None,
                }
                | VariableConstraint {
                    equal: None,
                    lower: Some(constraint),
                    upper: None,
                }
                | VariableConstraint {
                    equal: None,
                    lower: None,
                    upper: Some(constraint),
                } => {
                    substitutions.insert(variable, constraint);
                }
                VariableConstraint {
                    equal: Some(equal),
                    lower,
                    upper,
                } => {
                    // We need to check that both the lower and upper bounds are compatible with the
                    // equal bound
                    if let Some(lower) = lower
                        && !self.lattice.is_subtype_of(lower, equal)
                    {
                        todo!("issue diagnostic")
                    }

                    if let Some(upper) = upper
                        && !self.lattice.is_subtype_of(equal, upper)
                    {
                        todo!("issue diagnostic")
                    }

                    substitutions.insert(variable, equal);
                }
                VariableConstraint {
                    equal: None,
                    lower: Some(lower),
                    upper: Some(_),
                } => {
                    // We prefer to set the lower bound before the upper bound, even if both exist
                    substitutions.insert(variable, lower);
                }
            }

            todo!()
        }

        substitutions
    }

    pub fn solve(mut self) -> Substitution {
        self.solve_anti_symmetry();

        let constraints = self.apply_constraints();
        let substitutions = self.solve_constraints(constraints);

        todo!()
    }
}
