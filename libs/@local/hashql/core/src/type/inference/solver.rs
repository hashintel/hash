use alloc::rc::Rc;

use ena::unify::{InPlaceUnificationTable, NoError, UnifyKey as _};
use roaring::RoaringBitmap;

use super::{
    Constraint, Substitution, Variable,
    tarjan::Tarjan,
    variable::{VariableId, VariableLookup},
};
use crate::r#type::{
    TypeId,
    collection::FastHashMap,
    environment::{Diagnostics, Environment, LatticeEnvironment, SimplifyEnvironment},
};

pub(crate) struct Unification {
    table: InPlaceUnificationTable<VariableId>,

    variables: Vec<Variable>,
    lookup: FastHashMap<Variable, VariableId>,
}

impl Unification {
    pub(crate) fn new() -> Self {
        Self {
            table: InPlaceUnificationTable::new(),
            variables: Vec::new(),
            lookup: FastHashMap::default(),
        }
    }

    pub(crate) fn upsert_variable(&mut self, variable: Variable) -> VariableId {
        *self.lookup.entry(variable).or_insert_with_key(|&key| {
            let id = self.table.new_key(());
            debug_assert_eq!(id.into_usize(), self.variables.len());

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

    pub(crate) fn is_unioned(&mut self, lhs: Variable, rhs: Variable) -> bool {
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

        self.variables[id.into_usize()]
    }

    #[expect(clippy::cast_possible_truncation)]
    fn lookup(&mut self) -> VariableLookup {
        let mut lookup = FastHashMap::with_capacity_and_hasher(
            self.table.len(),
            foldhash::fast::RandomState::default(),
        );

        for (index, &variable) in self.variables.iter().enumerate() {
            let root = self.table.find(VariableId::from_index(index as u32));
            lookup.insert(variable, self.variables[root.into_usize()]);
        }

        VariableLookup::new(lookup)
    }
}

#[derive(Debug, Default)]
struct VariableConstraint {
    equal: Option<TypeId>,
    lower: Option<TypeId>,
    upper: Option<TypeId>,
}

pub struct InferenceSolver<'env, 'heap> {
    lattice: LatticeEnvironment<'env, 'heap>,
    simplify: SimplifyEnvironment<'env, 'heap>,

    diagnostics: Diagnostics,

    constraints: Vec<Constraint>,
    unification: Unification,
}

impl<'env, 'heap> InferenceSolver<'env, 'heap> {
    pub(crate) fn new(
        env: &'env Environment<'heap>,
        unification: Unification,
        constraints: Vec<Constraint>,
    ) -> Self {
        let mut lattice = LatticeEnvironment::new(env);
        lattice.without_simplify();
        lattice.set_inference_enabled(true);

        Self {
            lattice,
            simplify: SimplifyEnvironment::new(env),

            diagnostics: Diagnostics::new(),

            constraints,
            unification,
        }
    }

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
        graph.resize(variables, RoaringBitmap::new());

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
            graph[lower.into_usize()].insert(upper.index());
        }

        let tarjan = Tarjan::new(&graph);

        for scc in tarjan.compute() {
            for [lhs, rhs] in scc.iter().map_windows(|values: &[_; 2]| *values) {
                let lhs = self.unification.variables[lhs as usize];
                let rhs = self.unification.variables[rhs as usize];

                self.unification.unify(lhs, rhs);
            }
        }
    }

    fn apply_constraints(&mut self) -> FastHashMap<Variable, VariableConstraint> {
        let mut constraints = FastHashMap::default();

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
        constraints: FastHashMap<Variable, VariableConstraint>,
    ) -> FastHashMap<Variable, TypeId> {
        let mut substitutions = FastHashMap::default();

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
        }

        substitutions
    }

    fn simplify_substitutions(
        &mut self,
        lookup: VariableLookup,
        substitutions: &Rc<FastHashMap<Variable, TypeId>>,
    ) -> FastHashMap<Variable, TypeId> {
        // Now that everything is solved, go over each substitution and simplify it
        let mut simplified_substitutions = FastHashMap::default();

        // Make the simplifier aware of the substitutions
        self.simplify
            .set_substitution(Substitution::new(lookup, Rc::clone(substitutions)));

        for (&variable, &type_id) in &**substitutions {
            simplified_substitutions.insert(variable, self.simplify.simplify(type_id));
        }

        simplified_substitutions
    }

    #[must_use]
    pub fn solve(mut self) -> (Substitution, Diagnostics) {
        self.solve_anti_symmetry();

        let lookup = self.unification.lookup();
        // Set the variable substitutions in the lattice, this makes sure that `equal` constraints
        // are more lax when comparing equal values.
        self.lattice.set_variables(lookup.clone());

        let constraints = self.apply_constraints();
        let substitution = self.solve_constraints(constraints);
        let substitution = Rc::new(substitution);

        let substitution = self.simplify_substitutions(lookup.clone(), &substitution);
        let substitution = Substitution::new(lookup, Rc::new(substitution));

        let mut diagnostics = self.diagnostics;
        diagnostics.merge(self.lattice.take_diagnostics());
        if let Some(simplify) = self.simplify.take_diagnostics() {
            diagnostics.merge(simplify);
        }

        (substitution, diagnostics)
    }
}
