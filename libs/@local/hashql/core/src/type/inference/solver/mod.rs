mod graph;
mod tarjan;
#[cfg(test)]
mod test;
mod topo;

use ena::unify::{InPlaceUnificationTable, NoError, UnifyKey as _};

use self::{graph::Graph, tarjan::Tarjan, topo::topological_sort};
use super::{
    Constraint, Substitution, Variable, VariableKind,
    variable::{VariableId, VariableLookup},
};
use crate::r#type::{
    Type, TypeId,
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

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Bound {
    Upper,
    Lower,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct ResolvedVariable {
    origin: Variable,

    id: VariableId,
    kind: VariableKind,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct VariableOrdering {
    lower: ResolvedVariable,
    upper: ResolvedVariable,
}

#[derive(Debug, PartialEq, Eq, Default)]
struct VariableConstraint<L, R> {
    equal: Option<TypeId>,
    lower: L,
    upper: R,
}

type UnresolvedVariableConstraint = VariableConstraint<Vec<TypeId>, Vec<TypeId>>;
type LowerResolvedVariableConstraint = VariableConstraint<Option<TypeId>, Vec<TypeId>>;
type ResolvedVariableConstraint = VariableConstraint<Option<TypeId>, Option<TypeId>>;

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

        // We don't really care in which direction we record the constraints (as they're only
        // used to find the connected component) but they should be consistent. In
        // our case, we record the subtype relationship, e.g. `lower is a subtype of upper`,
        // therefore `lower -> upper`.
        // We also take into account any of the structural relationships, for example given: `_1 <:
        // (name: _2)`, and then `_2 <: 1`, this means that the following must hold: `_1 ≡ _2`.
        let mut graph = Graph::new(&mut self.unification);

        for &constraint in &self.constraints {
            let (source, target) = match constraint {
                Constraint::Ordering { lower, upper } => (lower, upper),
                Constraint::StructuralEdge { source, target } => (source, target),
                _ => continue,
            };

            let source = self.unification.lookup[&source.kind];
            let target = self.unification.lookup[&target.kind];

            graph.insert_edge(source, target);
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

    fn collect_constraints(
        &mut self,
    ) -> FastHashMap<VariableKind, (Variable, UnresolvedVariableConstraint)> {
        let mut constraints: FastHashMap<VariableKind, (Variable, UnresolvedVariableConstraint)> =
            FastHashMap::with_capacity_and_hasher(
                self.unification.variables.len(),
                foldhash::fast::RandomState::default(),
            );

        for &constraint in &self.constraints {
            match constraint {
                Constraint::UpperBound { variable, bound } => {
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    constraint.upper.push(bound);
                }
                Constraint::LowerBound { variable, bound } => {
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    constraint.lower.push(bound);
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

    fn apply_constraints_prepare_substitution<L, H>(
        &mut self,
        graph: &Graph,
        variables: &FastHashMap<VariableKind, (Variable, VariableConstraint<L, H>)>,
    ) -> Substitution {
        // Into the substitution map, insert any equal substitutions, which we know - if they are
        // valid - the type is supposed to always be this type.
        //
        // This assumption is then verified in a later pass.
        let mut substitution = Substitution::new(
            self.unification.lookup(),
            FastHashMap::with_capacity_and_hasher(
                variables.len(),
                foldhash::fast::RandomState::default(),
            ),
        );

        for node in graph.nodes() {
            let kind = self.unification.variables[node.into_usize()];
            let (_, variable_constraint) = &variables[&kind];

            if let Some(equal) = variable_constraint.equal {
                substitution.insert(kind, equal);
            }
        }

        substitution
    }

    fn apply_constraints_prepare_constraints(
        &mut self,
        lookup_by: Bound,
    ) -> FastHashMap<VariableId, Vec<VariableOrdering>> {
        let mut lookup: FastHashMap<VariableId, Vec<VariableOrdering>> =
            FastHashMap::with_capacity_and_hasher(
                self.unification.variables.len(),
                foldhash::fast::RandomState::default(),
            );

        for &constraint in &self.constraints {
            let Constraint::Ordering { lower, upper } = constraint else {
                continue;
            };

            let lower_kind = self.unification.root(lower.kind);
            let upper_kind = self.unification.root(upper.kind);

            let lower_id = self.unification.lookup[&lower_kind];
            let upper_id = self.unification.lookup[&upper_kind];

            let entry = lookup
                .entry(match lookup_by {
                    Bound::Lower => lower_id,
                    Bound::Upper => upper_id,
                })
                .or_default();

            entry.push(VariableOrdering {
                lower: ResolvedVariable {
                    origin: lower,
                    id: lower_id,
                    kind: lower_kind,
                },
                upper: ResolvedVariable {
                    origin: upper,
                    id: upper_id,
                    kind: upper_kind,
                },
            });
        }

        lookup
    }

    fn apply_constraints_forwards(
        &mut self,
        graph: &Graph,
        mut variables: FastHashMap<VariableKind, (Variable, UnresolvedVariableConstraint)>,
    ) -> FastHashMap<VariableKind, (Variable, LowerResolvedVariableConstraint)> {
        let mut constraints = FastHashMap::with_capacity_and_hasher(
            variables.len(),
            foldhash::fast::RandomState::default(),
        );

        let substitution = self.apply_constraints_prepare_substitution(graph, &variables);
        self.lattice.set_substitution(substitution);

        // We're currently looking through `lower`, therefore, look for any variables for which
        // `a <: b`, where `b` is the current node.
        let lookup = self.apply_constraints_prepare_constraints(Bound::Upper);

        // Does a forwards pass over the graph to apply any lower constraints in order
        let topo = topological_sort(graph).expect("expected dag after anti-symmetry run");

        for index in topo {
            let id = graph.node(index);
            let kind = self.unification.variables[id.into_usize()];

            let (variable, mut variable_constraint) =
                variables.remove(&kind).expect("variable should exist");

            let Some(transitive_constraints) = lookup.get(&id) else {
                continue;
            };

            for &VariableOrdering { lower, upper: _ } in transitive_constraints {
                // this bound applies to us
                variable_constraint
                    .lower
                    .push(self.lattice.alloc(|id| Type {
                        id,
                        span: lower.origin.span,
                        kind: self.lattice.intern_kind(lower.kind.into_type_kind()),
                    }));
            }

            // Now that we have all bounds, unify them
            let VariableConstraint {
                equal,
                lower,
                upper,
            } = variable_constraint;

            let lower = lower
                .into_iter()
                .reduce(|lhs, rhs| self.lattice.meet(lhs, rhs));

            if equal.is_none()
                && let Some(lower) = lower
            {
                // insert into substitution map
                let substitution = self
                    .lattice
                    .substitution_mut()
                    .expect("substition should have been set previously");

                substitution.insert(kind, lower);
            }

            constraints.insert(
                kind,
                (
                    variable,
                    VariableConstraint {
                        equal,
                        lower,
                        upper,
                    },
                ),
            );
        }

        self.lattice.clear_substitution();

        constraints
    }

    fn apply_constraints_backwards(
        &mut self,
        graph: &Graph,
        mut variables: FastHashMap<VariableKind, (Variable, LowerResolvedVariableConstraint)>,
    ) -> FastHashMap<VariableKind, (Variable, ResolvedVariableConstraint)> {
        let mut constraints = FastHashMap::with_capacity_and_hasher(
            variables.len(),
            foldhash::fast::RandomState::default(),
        );

        let substitution = self.apply_constraints_prepare_substitution(graph, &variables);
        self.lattice.set_substitution(substitution);

        // We're currently looking through `upper`, therefore, look for any variables for which
        // `a <: b`, where `a` is the current node.
        let lookup = self.apply_constraints_prepare_constraints(Bound::Lower);

        // We do a backwards pass over the graph to apply any upper constraints in order
        let topo = topological_sort(graph).expect("expected dag after anti-symmetry run");

        for index in topo.into_iter().rev() {
            let id = graph.node(index);
            let kind = self.unification.variables[id.into_usize()];

            let (variable, mut variable_constraint) =
                variables.remove(&kind).expect("variable should exist");

            let Some(transitive_constraints) = lookup.get(&id) else {
                continue;
            };

            for &VariableOrdering { lower: _, upper } in transitive_constraints {
                // this bound applies to us
                variable_constraint
                    .upper
                    .push(self.lattice.alloc(|id| Type {
                        id,
                        span: upper.origin.span,
                        kind: self.lattice.intern_kind(upper.kind.into_type_kind()),
                    }));
            }

            // Now that we have all bounds, unify them
            let VariableConstraint {
                equal,
                lower,
                upper,
            } = variable_constraint;

            let upper = upper
                .into_iter()
                .reduce(|lhs, rhs| self.lattice.join(lhs, rhs));

            if equal.is_none()
                && let Some(upper) = upper
            {
                // insert into substitution map, so that future resolvers can use it can use it
                let substitution = self
                    .lattice
                    .substitution_mut()
                    .expect("substition should have been set previously");

                substitution.insert(kind, upper);
            }

            constraints.insert(
                kind,
                (
                    variable,
                    VariableConstraint {
                        equal,
                        lower,
                        upper,
                    },
                ),
            );
        }

        self.lattice.clear_substitution();

        constraints
    }

    fn apply_constraints(
        &mut self,
    ) -> FastHashMap<VariableKind, (Variable, ResolvedVariableConstraint)> {
        let mut graph = Graph::new(&mut self.unification);

        // build the graph over the constraints
        for &constraint in &self.constraints {
            let (source, target) = match constraint {
                Constraint::Ordering { lower, upper } => (lower, upper),
                Constraint::StructuralEdge { source, target } => (source, target),
                _ => continue,
            };

            graph.insert_edge(
                self.unification.lookup[&source.kind],
                self.unification.lookup[&target.kind],
            );
        }

        let constraints = self.collect_constraints();
        let constraints = self.apply_constraints_forwards(&graph, constraints);

        self.apply_constraints_backwards(&graph, constraints)
    }

    fn solve_constraints(
        &mut self,
        constraints: FastHashMap<VariableKind, (Variable, ResolvedVariableConstraint)>,
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
        substitutions: FastHashMap<VariableKind, TypeId>,
    ) -> FastHashMap<VariableKind, TypeId> {
        // Now that everything is solved, go over each substitution and simplify it
        let mut simplified_substitutions = FastHashMap::default();

        // Make the simplifier aware of the substitutions
        self.simplify
            .set_substitution(Substitution::new(lookup, substitutions.clone()));

        for (variable, type_id) in substitutions {
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

        self.verify_constrained(&lookup, &substitution);

        let substitution = self.simplify_substitutions(lookup.clone(), substitution.clone());
        let substitution = Substitution::new(lookup, substitution);

        let mut diagnostics = self.diagnostics;
        diagnostics.merge(self.lattice.take_diagnostics());
        if let Some(simplify) = self.simplify.take_diagnostics() {
            diagnostics.merge(simplify);
        }

        (substitution, diagnostics)
    }
}
