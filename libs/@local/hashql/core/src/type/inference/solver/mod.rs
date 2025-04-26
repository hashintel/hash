#[cfg(test)]
mod test;

use alloc::rc::Rc;

use ena::unify::{InPlaceUnificationTable, NoError, UnifyKey as _};
use roaring::RoaringBitmap;

use super::{
    Constraint, Substitution, Variable, VariableKind,
    tarjan::Tarjan,
    variable::{VariableId, VariableLookup},
};
use crate::r#type::{
    TypeId,
    collection::FastHashMap,
    environment::{Diagnostics, Environment, LatticeEnvironment, SimplifyEnvironment},
    error::{
        bound_constraint_violation, conflicting_equality_constraints,
        incompatible_lower_equal_constraint, incompatible_upper_equal_constraint,
        unconstrained_type_variable, unconstrained_type_variable_floating,
    },
};

pub(crate) struct Unification {
    table: InPlaceUnificationTable<VariableId>,

    variables: Vec<VariableKind>,
    lookup: FastHashMap<VariableKind, VariableId>,
}

impl Unification {
    pub(crate) fn new() -> Self {
        Self {
            table: InPlaceUnificationTable::new(),
            variables: Vec::new(),
            lookup: FastHashMap::default(),
        }
    }

    pub(crate) fn upsert_variable(&mut self, variable: VariableKind) -> VariableId {
        *self.lookup.entry(variable).or_insert_with_key(|&key| {
            let id = self.table.new_key(());
            debug_assert_eq!(id.into_usize(), self.variables.len());

            self.variables.push(key);
            id
        })
    }

    pub(crate) fn unify(&mut self, lhs: VariableKind, rhs: VariableKind) {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table
            .unify_var_var(lhs, rhs)
            .unwrap_or_else(|_: NoError| unreachable!());
    }

    pub(crate) fn is_unioned(&mut self, lhs: VariableKind, rhs: VariableKind) -> bool {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table.unioned(lhs, rhs)
    }

    fn root_id(&mut self, variable: VariableKind) -> VariableId {
        let id = self.upsert_variable(variable);

        self.table.find(id)
    }

    fn root(&mut self, variable: VariableKind) -> VariableKind {
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

#[derive(Debug, PartialEq, Eq, Default)]
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

    fn upsert_variables(&mut self) {
        for constraint in &self.constraints {
            for variable in constraint.variables() {
                self.unification.upsert_variable(variable.kind);
            }
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
            let lower = self.unification.root_id(lower.kind);
            let upper = self.unification.root_id(upper.kind);
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

    fn apply_constraints(&mut self) -> FastHashMap<VariableKind, (Variable, VariableConstraint)> {
        let mut constraints: FastHashMap<VariableKind, (Variable, VariableConstraint)> =
            FastHashMap::default();

        for &constraint in &self.constraints {
            match constraint {
                Constraint::UpperBound { variable, bound } => {
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    match constraint.upper {
                        None => {
                            constraint.upper = Some(bound);
                        }
                        Some(existing) => {
                            constraint.upper = Some(self.lattice.join(existing, bound));
                        }
                    }
                }
                Constraint::LowerBound { variable, bound } => {
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    match constraint.lower {
                        None => {
                            constraint.lower = Some(bound);
                        }
                        Some(existing) => {
                            constraint.lower = Some(self.lattice.meet(existing, bound));
                        }
                    }
                }
                Constraint::Equals { variable, r#type } => {
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    match constraint.equal {
                        None => {
                            constraint.equal = Some(r#type);
                        }
                        Some(existing) if self.lattice.is_equivalent(existing, r#type) => {
                            // do nothing, this is fine
                        }
                        Some(existing) => self.diagnostics.push(conflicting_equality_constraints(
                            &self.lattice,
                            variable,
                            self.lattice.types[existing].copied(),
                            self.lattice.types[r#type].copied(),
                        )),
                    }
                }
                // Solved prior in anti-symmetry pass, we still insert them into the constraints
                // map, so that we can report proper errors in `solve_constraints`
                Constraint::Ordering { lower, upper } => {
                    let lower_root = self.unification.root(lower.kind);
                    let _: Result<_, _> =
                        constraints.try_insert(lower_root, (lower, VariableConstraint::default()));

                    let upper_root = self.unification.root(upper.kind);
                    let _: Result<_, _> =
                        constraints.try_insert(upper_root, (upper, VariableConstraint::default()));
                }
                Constraint::StructuralEdge { source, target } => {
                    let source_root = self.unification.root(source.kind);
                    let _: Result<_, _> = constraints
                        .try_insert(source_root, (source, VariableConstraint::default()));

                    let target_root = self.unification.root(target.kind);
                    let _: Result<_, _> = constraints
                        .try_insert(target_root, (target, VariableConstraint::default()));
                }
            }
        }

        constraints
    }

    // TODO: we need to do a two-pass, the first pass will solve all the constraints that have at
    // least one Some. The second pass then will solve all the constraints that have none, but takes
    // into account the solved constraints as bounds.
    fn solve_constraints(
        &mut self,
        constraints: FastHashMap<VariableKind, (Variable, VariableConstraint)>,
    ) -> FastHashMap<VariableKind, TypeId> {
        let mut substitutions = FastHashMap::default();

        for (kind, (variable, constraint)) in constraints {
            if let VariableConstraint {
                equal: _,
                lower: Some(lower),
                upper: Some(upper),
            } = constraint
                && !self.lattice.is_subtype_of(lower, upper)
            {
                self.diagnostics.push(bound_constraint_violation(
                    &self.lattice,
                    variable,
                    self.lattice.types[lower].copied(),
                    self.lattice.types[upper].copied(),
                ));

                continue;
            }

            match constraint {
                // If there's no constraint, we can't infer anything
                VariableConstraint {
                    equal: None,
                    lower: None,
                    upper: None,
                } => {
                    // TODO: remove this in favour of a second pass, that looks at all the parents
                    // and children to see if there are any that can be the upper/lower bound
                    // instead (this would then need to be `meet`/`join`ed)

                    self.diagnostics.push(unconstrained_type_variable(variable));
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
                    substitutions.insert(kind, constraint);
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
                        self.diagnostics.push(incompatible_lower_equal_constraint(
                            &self.lattice,
                            variable,
                            self.lattice.types[lower].copied(),
                            self.lattice.types[equal].copied(),
                        ));

                        continue;
                    }

                    if let Some(upper) = upper
                        && !self.lattice.is_subtype_of(equal, upper)
                    {
                        self.diagnostics.push(incompatible_upper_equal_constraint(
                            &self.lattice,
                            variable,
                            self.lattice.types[equal].copied(),
                            self.lattice.types[upper].copied(),
                        ));

                        continue;
                    }

                    substitutions.insert(kind, equal);
                }
                VariableConstraint {
                    equal: None,
                    lower: Some(lower),
                    upper: Some(_),
                } => {
                    // We prefer to set the lower bound before the upper bound, even if both exist
                    substitutions.insert(kind, lower);
                }
            }
        }

        substitutions
    }

    fn verify_constrained(
        &mut self,
        lookup: &VariableLookup,
        substitution: &FastHashMap<VariableKind, TypeId>,
    ) {
        for &variable in &self.unification.variables {
            let root = lookup[variable];
            if !substitution.contains_key(&root) {
                self.diagnostics
                    .push(unconstrained_type_variable_floating(&self.lattice));
            }
        }
    }

    fn simplify_substitutions(
        &mut self,
        lookup: VariableLookup,
        substitutions: &Rc<FastHashMap<VariableKind, TypeId>>,
    ) -> FastHashMap<VariableKind, TypeId> {
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
        self.upsert_variables();
        self.solve_anti_symmetry();

        let lookup = self.unification.lookup();
        // Set the variable substitutions in the lattice, this makes sure that `equal` constraints
        // are more lax when comparing equal values.
        self.lattice.set_variables(lookup.clone());

        let constraints = self.apply_constraints();
        let substitution = self.solve_constraints(constraints);
        let substitution = Rc::new(substitution);

        self.verify_constrained(&lookup, &substitution);

        let substitution = self.simplify_substitutions(lookup.clone(), &substitution);
        let substitution = Substitution::new(lookup, Rc::new(substitution));

        // TODO: check if there are any variables that have no constraints and therefore need to
        // error out

        let mut diagnostics = self.diagnostics;
        diagnostics.merge(self.lattice.take_diagnostics());
        if let Some(simplify) = self.simplify.take_diagnostics() {
            diagnostics.merge(simplify);
        }

        (substitution, diagnostics)
    }
}
