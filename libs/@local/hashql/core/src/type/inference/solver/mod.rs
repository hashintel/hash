//! Constraint-based type inference using fix-point iteration.
//!
//! Resolves subtyping relationships, equality constraints, and structural dependencies
//! to determine the most specific types for type variables.
//!
//! The main entry point is [`InferenceSolver`], which solves constraints through:
//!
//! 1. **Fix-point iteration** until convergence:
//!    - Register variables in lattice environment
//!    - Solve anti-symmetry constraints (`A <: B ∧ B <: A ⟹ A = B`)
//!    - Set up variable substitutions
//!    - Collect constraints per variable
//!    - Apply forward/backward constraint passes
//!    - Verify all variables are constrained
//! 2. **Simplification** to canonical forms
//! 3. **Validation** of final constraint system
//! 4. **Diagnostic collection** for error reporting
//!
//! Operates on a lattice where types form a partial order, enabling efficient computation of meets
//! (greatest lower bounds) and joins (least upper bounds).

mod graph;
mod tarjan;
#[cfg(test)]
mod test;
mod topo;

use bumpalo::Bump;
use ena::unify::{InPlaceUnificationTable, NoError, UnifyKey as _};

use self::{graph::Graph, tarjan::Tarjan, topo::topological_sort_in};
use super::{
    Constraint, SelectionConstraint, Substitution, Variable, VariableKind,
    variable::{VariableId, VariableLookup},
};
use crate::{
    collection::{FastHashMap, SmallVec, fast_hash_map, fast_hash_map_in},
    r#type::{
        PartialType, TypeId,
        environment::{Diagnostics, Environment, LatticeEnvironment, SimplifyEnvironment},
        error::{
            bound_constraint_violation, conflicting_equality_constraints,
            incompatible_lower_equal_constraint, incompatible_upper_equal_constraint,
            unconstrained_type_variable, unconstrained_type_variable_floating,
            unresolved_selection_constraint,
        },
        lattice::Projection,
    },
};

/// Union-find data structure for tracking variable equivalence classes.
///
/// Variables unified through anti-symmetry constraints (`A <: B ∧ B <: A`) become part
/// of the same equivalence class and share constraints.
///
/// Maintains:
/// - Union-find table with path compression and union by rank
/// - Bidirectional mapping between [`VariableKind`] and internal IDs
/// - Canonical representatives for each equivalence class
#[derive(Debug)]
pub(crate) struct Unification {
    /// The underlying union-find data structure that tracks variable equivalence classes
    table: InPlaceUnificationTable<VariableId>,

    /// All variable kinds in the system, indexed by their ID
    variables: Vec<VariableKind>,
    /// Maps variable kinds to their corresponding IDs for efficient lookup
    lookup: FastHashMap<VariableKind, VariableId>,
}

impl Unification {
    /// Creates a new unification table.
    pub(crate) fn new() -> Self {
        Self {
            table: InPlaceUnificationTable::new(),
            variables: Vec::new(),
            lookup: FastHashMap::default(),
        }
    }

    /// Returns the ID for a variable, inserting it if not present.
    ///
    /// Ensures each [`VariableKind`] has exactly one ID for consistent lookup.
    pub(crate) fn upsert_variable(&mut self, variable: VariableKind) -> VariableId {
        *self.lookup.entry(variable).or_insert_with_key(|&key| {
            let id = self.table.new_key(());
            debug_assert_eq!(id.into_usize(), self.variables.len());

            self.variables.push(key);
            id
        })
    }

    /// Unifies two variables into the same equivalence class.
    ///
    /// Constraint merging must be handled separately to avoid data loss.
    pub(crate) fn unify(&mut self, lhs: VariableKind, rhs: VariableKind) {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table
            .unify_var_var(lhs, rhs)
            .unwrap_or_else(|_: NoError| unreachable!());
    }

    /// Checks if two variables belong to the same equivalence class.
    pub(crate) fn is_unioned(&mut self, lhs: VariableKind, rhs: VariableKind) -> bool {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table.unioned(lhs, rhs)
    }

    /// Finds the canonical representative ID for a variable's equivalence class.
    fn root_id(&mut self, variable: VariableKind) -> VariableId {
        let id = self.upsert_variable(variable);

        self.table.find(id)
    }

    /// Finds the canonical [`VariableKind`] for a variable's equivalence class.
    fn root(&mut self, variable: VariableKind) -> VariableKind {
        let id = self.root_id(variable);

        self.variables[id.into_usize()]
    }

    /// Creates a lookup table mapping variables to their canonical representatives.
    ///
    /// Returns a snapshot of the current unification state. Future modifications
    /// are not reflected in the returned lookup table.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "This cast is safe because the number of type variables are limited to \
                  `u32::MAX` due to ena."
    )]
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

/// Direction of a type bound constraint in the lattice.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Bound {
    /// Upper bound: variable must be a subtype of the bound (X <: T).
    Upper,
    /// Lower bound: variable must be a supertype of the bound (T <: X).
    Lower,
}

/// Variable with resolved unification information.
///
/// Contains both user-facing information (for error reporting) and internal
/// unification data (IDs and canonical kinds).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct ResolvedVariable {
    /// Original variable from source code (for error reporting)
    origin: Variable,

    /// Internal unification system ID
    id: VariableId,
    /// Canonical kind after unification
    kind: VariableKind,
}

/// Subtyping constraint where `lower <: upper`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct VariableOrdering {
    /// Variable that must be a subtype
    lower: ResolvedVariable,
    /// Variable that must be a supertype
    upper: ResolvedVariable,
}

/// Aggregated constraints for a single type variable.
///
/// Organizes constraints by type (equality, lower bounds, upper bounds).
/// Multiple constraints of the same type are reduced using lattice operations.
#[derive(Debug, PartialEq, Eq, Default)]
struct VariableConstraint {
    /// Exact type this variable must equal
    equal: Option<TypeId>,
    /// Lower bound constraints (variable must be supertype of these)
    lower: SmallVec<TypeId>,
    /// Upper bound constraints (variable must be subtype of these)
    upper: SmallVec<TypeId>,
}

impl VariableConstraint {
    fn finish(&self) -> EvaluatedVariableConstraint {
        debug_assert!(
            self.lower.len() <= 1,
            "lower bound should be either empty or contain exactly one type"
        );
        debug_assert!(
            self.upper.len() <= 1,
            "upper bound should be either empty or contain exactly one type"
        );

        EvaluatedVariableConstraint {
            equal: self.equal,
            lower: self.lower.first().copied(),
            upper: self.upper.last().copied(),
        }
    }
}

/// Final constraints after lattice reduction.
///
/// Contains the reduced constraints (meet for lower bounds, join for upper bounds)
/// that determine the variable's inferred type.
#[derive(Debug, PartialEq, Eq, Default)]
struct EvaluatedVariableConstraint {
    /// Final equality constraint
    equal: Option<TypeId>,
    /// Final lower bound constraint
    lower: Option<TypeId>,
    /// Final upper bound constraint
    upper: Option<TypeId>,
}

/// Constraint solver using fix-point iteration.
///
/// Resolves type constraints to determine the most specific types for each variable.
/// Operates on a lattice where types form a partial order.
///
/// Handles:
/// - **Equality constraints**: Variable equals specific type
/// - **Subtyping constraints**: Variable is subtype/supertype of another
/// - **Selection constraints**: Field access depending on type structure
/// - **Ordering constraints**: Variables related through subtyping
///
/// # Algorithm
///
/// 1. **Fix-point iteration** until convergence:
///    - Register variables in lattice environment
///    - Solve anti-symmetry constraints (`A <: B ∧ B <: A ⟹ A = B`)
///    - Set up variable substitutions
///    - Collect constraints per variable
///    - Apply forward/backward constraint passes
///    - Verify all variables are constrained
///    - Validate constraints and compute substitutions
/// 2. **Simplification** to canonical forms
/// 3. **Validation** of final constraint system
/// 4. **Diagnostic collection** for error reporting
pub struct InferenceSolver<'env, 'heap> {
    /// Environment for lattice operations (meet, join, subtyping)
    lattice: LatticeEnvironment<'env, 'heap>,
    /// Environment for type simplification
    simplify: SimplifyEnvironment<'env, 'heap>,

    /// Diagnostics for type error reporting
    diagnostics: Diagnostics,
    persistent_diagnostics: Diagnostics,

    /// Constraints to be solved
    constraints: Vec<Constraint<'heap>>,
    /// Unification system for tracking variable equivalence
    unification: Unification,
}

impl<'env, 'heap> InferenceSolver<'env, 'heap> {
    /// Creates a new inference solver.
    ///
    /// Configures a lattice environment with simplification disabled during solving
    /// to maintain correctness. Simplification occurs after constraint resolution.
    pub(crate) fn new(
        env: &'env Environment<'heap>,
        unification: Unification,
        constraints: Vec<Constraint<'heap>>,
    ) -> Self {
        let mut lattice = LatticeEnvironment::new(env);
        lattice.without_simplify();
        lattice.set_inference_enabled(true);

        Self {
            lattice,
            simplify: SimplifyEnvironment::new(env),

            diagnostics: Diagnostics::new(),
            persistent_diagnostics: Diagnostics::new(),

            constraints,
            unification,
        }
    }

    /// Registers all constraint variables with the unification system.
    fn upsert_variables(&mut self, graph: &mut Graph) {
        for constraint in &self.constraints {
            for variable in constraint.variables() {
                self.unification.upsert_variable(variable.kind);
            }
        }

        graph.expansion(&mut self.unification);
    }

    /// Merges constraints from unified variables.
    ///
    /// Combines bound constraints and detects conflicting equality constraints.
    fn unify_variables(
        &mut self,
        variables: &mut FastHashMap<VariableKind, (Variable, VariableConstraint)>,
        root: VariableKind,
        lhs: Option<(VariableKind, (Variable, VariableConstraint))>,
        rhs: Option<(VariableKind, (Variable, VariableConstraint))>,
    ) {
        match (lhs, rhs) {
            (None, None) => {}
            (Some((_, value)), None) | (None, Some((_, value))) => {
                variables.insert(root, value);
            }
            (
                Some((lhs_kind, (lhs_variable, mut lhs_constraint))),
                Some((_, (rhs_variable, mut rhs_constraint))),
            ) => {
                // Not necessary per-se, but allows us to have more accurate variable tracking
                // throughout the solver
                let variable = if root == lhs_kind {
                    lhs_variable
                } else {
                    rhs_variable
                };

                let VariableConstraint {
                    equal,
                    lower,
                    upper,
                } = &mut lhs_constraint;

                lower.append(&mut rhs_constraint.lower);
                upper.append(&mut rhs_constraint.upper);

                *equal = match (*equal, rhs_constraint.equal) {
                    (None, None) => None,
                    (Some(equal), None) | (None, Some(equal)) => Some(equal),
                    (Some(lhs), Some(rhs)) if self.lattice.is_equivalent(lhs, rhs) => Some(lhs),
                    (Some(lhs), Some(rhs)) => {
                        // This is a persistent diagnostic because this constraint is "destructive",
                        // meaning it won't be rerun.
                        self.persistent_diagnostics
                            .push(conflicting_equality_constraints(
                                &self.lattice,
                                variable,
                                self.lattice.r#type(lhs),
                                self.lattice.r#type(rhs),
                            ));

                        // We keep the type, so that we can continue inference, but we issue a
                        // diagnostic to inform the user of the conflict
                        Some(lhs)
                    }
                };

                variables.insert(root, (variable, lhs_constraint));
            }
        }
    }

    /// Identifies and unifies variables that must be equal due to anti-symmetry.
    ///
    /// Uses Tarjan's algorithm on a graph of subtyping and structural relationships
    /// to find strongly connected components. If `A <: B` and `B <: A`, then `A ≡ B`.
    ///
    /// Graph includes:
    /// - **Ordering constraints**: Direct subtyping between variables
    /// - **Structural edges**: Dependencies from field access constraints
    fn solve_anti_symmetry(
        &mut self,
        graph: &mut Graph,
        variables: &mut FastHashMap<VariableKind, (Variable, VariableConstraint)>,
        bump: &Bump,
    ) {
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

        // Run Tarjan's SCC algorithm to find strongly connected components
        let tarjan = Tarjan::new_in(graph, bump);

        // For each strongly connected component, unify all variables in the component
        // since they must be equal due to anti-symmetry of the subtyping relation
        for scc in tarjan.compute() {
            for [lhs, rhs] in scc.iter().map_windows(|values: &[_; 2]| *values) {
                let lhs = self.unification.variables[lhs as usize];
                let rhs = self.unification.variables[rhs as usize];

                let lhs_entry = variables.remove_entry(&lhs);
                let rhs_entry = variables.remove_entry(&rhs);

                self.unification.unify(lhs, rhs);

                // This is the new unified root
                let root = self.unification.root(lhs);
                self.unify_variables(variables, root, lhs_entry, rhs_entry);
            }
        }

        graph.condense(&mut self.unification);
    }

    /// Collects and organizes constraints by their target variables.
    ///
    /// Processes the constraint list and groups constraints by the canonical
    /// representative of the variable they affect. Each constraint type is handled appropriately:
    /// - **Bound constraints** are collected into upper/lower bound lists
    /// - **Equality constraints** are checked for conflicts and stored
    /// - **Ordering constraints** ensure variables are present in the constraint map
    /// - **Selection constraints** are specialized and collected separately
    ///
    /// Maintains both the original variable (for error reporting) and the canonical representative
    /// (for constraint solving) in the resulting map.
    fn collect_constraints(
        &mut self,
        constraints: &mut FastHashMap<VariableKind, (Variable, VariableConstraint)>,
        selections: &mut Vec<SelectionConstraint<'heap>>,
    ) {
        for &constraint in &self.constraints {
            match constraint {
                Constraint::UpperBound { variable, bound } => {
                    // Find the canonical representative for this variable
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    // Add the upper bound to this variable's constraints
                    constraint.upper.push(bound);
                }
                Constraint::LowerBound { variable, bound } => {
                    // Find the canonical representative for this variable
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    // Add the lower bound to this variable's constraints
                    constraint.lower.push(bound);
                }
                Constraint::Equals { variable, r#type } => {
                    // Find the canonical representative for this variable
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    // Check for conflicting equality constraints
                    match constraint.equal {
                        None => {
                            constraint.equal = Some(r#type);
                        }
                        Some(existing) if self.lattice.is_equivalent(existing, r#type) => {
                            // do nothing, this is fine
                        }
                        Some(existing) => {
                            // As this is a destructive operation (the constraint won't be re-run)
                            // this is a persistent diagnostic
                            self.persistent_diagnostics
                                .push(conflicting_equality_constraints(
                                    &self.lattice,
                                    variable,
                                    self.lattice.r#type(existing),
                                    self.lattice.r#type(r#type),
                                ));
                        }
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
                constraint @ Constraint::Selection(mut selection) => {
                    // Try to "specialize" each constraint, meaning look if the type it's referring
                    // to is just a variable, if that's the case, change the subject to the
                    // variable.
                    selection.specialize(self.lattice.environment);

                    // Insert each variable in the selection into the constraints map
                    for variable in constraint.variables() {
                        let variable_root = self.unification.root(variable.kind);
                        let _: Result<_, _> = constraints
                            .try_insert(variable_root, (variable, VariableConstraint::default()));
                    }

                    selections.push(selection);
                }
            }
        }
    }

    /// Creates substitution map from equality constraints.
    ///
    /// Enables the lattice environment to resolve variables to known types during
    /// constraint processing.
    fn apply_constraints_prepare_substitution(
        &mut self,
        graph: &Graph,
        variables: &FastHashMap<VariableKind, (Variable, VariableConstraint)>,
    ) -> Substitution {
        let mut substitution =
            Substitution::new(self.unification.lookup(), fast_hash_map(variables.len()));

        for node in graph.nodes() {
            let kind = self.unification.variables[node.into_usize()];

            let Some((_, variable_constraint)) = variables.get(&kind) else {
                tracing::warn!(?kind, "variable is unconstrained");
                continue;
            };

            if let Some(equal) = variable_constraint.equal {
                substitution.insert(kind, equal);
            }
        }

        substitution
    }

    /// Groups ordering constraints by bound direction.
    ///
    /// Creates lookup table for efficient retrieval of transitive constraints during
    /// forward and backward passes.
    fn apply_constraints_prepare_constraints<'bump>(
        &mut self,
        lookup_by: Bound,
        heap: &'bump Bump,
    ) -> FastHashMap<VariableId, Vec<VariableOrdering>, &'bump Bump> {
        let mut lookup: FastHashMap<VariableId, Vec<VariableOrdering>, &'bump Bump> =
            fast_hash_map_in(self.unification.variables.len(), heap);

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
                    // Index by the variable based on lookup direction
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

    /// Resolves lower bounds via forward propagation in topological order.
    ///
    /// For each variable:
    /// 1. Collects transitive lower bounds from ordering constraints (if no equality constraint)
    /// 2. Computes meet (greatest lower bound) of all collected bounds
    /// 3. Updates substitution map for subsequent variables
    /// 4. Replaces variable's lower bound list with computed meet
    ///
    /// Topological ordering ensures dependencies resolve before dependents.
    fn apply_constraints_forwards(
        &mut self,
        graph: &Graph,
        bump: &Bump,
        variables: &mut FastHashMap<VariableKind, (Variable, VariableConstraint)>,
    ) {
        // Create a substitution from known equality constraints
        let substitution = self.apply_constraints_prepare_substitution(graph, variables);
        self.lattice.set_substitution(substitution);

        // We're currently looking through `lower`, therefore, look for any variables for which
        // `a <: b`, where `b` is the current node.
        let lookup = self.apply_constraints_prepare_constraints(Bound::Upper, bump);

        // Does a forwards pass over the graph to apply any lower constraints in order
        // Process nodes in topological order to ensure dependencies are resolved first
        let topo = topological_sort_in(graph, bump).expect("expected dag after anti-symmetry run");

        for index in topo {
            let id = graph.node(index);
            let kind = self.unification.variables[id.into_usize()];

            let Some((_, variable_constraint)) = variables.get_mut(&kind) else {
                tracing::warn!(?kind, "variable is unconstrained");
                continue;
            };

            // Check for transitive constraints from ordering relationships
            // e.g., if we have constraints `X <: Y` and we're processing Y,
            // then X becomes a lower bound on Y

            // CRITICAL: Skip adding transitive bounds if we already have an equality constraint.
            // This is essential for correctness, not just optimization. For example, given:
            //   _1 <: _2
            //   _2 = String
            // If we applied _1 as a lower bound on _2, it could create inconsistencies since
            // the equality constraint is more specific and must take precedence. The type of _2
            // is already fully determined by the equality constraint.
            if let Some(transitive_constraints) = lookup.get(&id)
                && variable_constraint.equal.is_none()
            {
                for &VariableOrdering { lower, upper: _ } in transitive_constraints {
                    if !self.lattice.contains_substitution(lower.kind) {
                        // This is a type that hasn't contributed to the lattice, meaning it's not
                        // relevant to our current inference process / has no lower bound that we
                        // can apply.
                        continue;
                    }

                    // this bound applies to us
                    variable_constraint
                        .lower
                        .push(self.lattice.intern_type(PartialType {
                            span: lower.origin.span,
                            kind: self.lattice.intern_kind(lower.kind.into_type_kind()),
                        }));
                }
            }

            // Now that we have all bounds, unify them

            // Compute the meet (greatest lower bound) of all lower bounds
            let lower = variable_constraint
                .lower
                .iter()
                .copied()
                .reduce(|lhs, rhs| self.lattice.meet(lhs, rhs));

            // If there's no equality constraint but we have a lower bound,
            // add the lower bound to the substitution map for future resolution
            if variable_constraint.equal.is_none()
                && let Some(lower) = lower
            {
                // insert into substitution map
                let substitution = self
                    .lattice
                    .substitution_mut()
                    .expect("substition should have been set previously");

                substitution.insert(kind, lower);
            }

            variable_constraint.lower.clear();
            if let Some(lower) = lower {
                variable_constraint.lower.push(lower);
            }
        }

        // Clear substitution to avoid unintended effects in later operations
        self.lattice.clear_substitution();
    }

    /// Resolves upper bounds via backward propagation in reverse topological order.
    ///
    /// For each variable:
    /// 1. Collects transitive upper bounds from ordering constraints (if no equality constraint)
    /// 2. Computes join (least upper bound) of all collected bounds
    /// 3. Updates substitution map for subsequent variables
    /// 4. Replaces variable's upper bound list with computed join
    ///
    /// Reverse topological ordering ensures dependent relationships propagate correctly.
    fn apply_constraints_backwards(
        &mut self,
        graph: &Graph,
        bump: &Bump,
        variables: &mut FastHashMap<VariableKind, (Variable, VariableConstraint)>,
    ) {
        // Create a substitution from known equality and lower bound constraints
        let substitution = self.apply_constraints_prepare_substitution(graph, variables);
        self.lattice.set_substitution(substitution);

        // We're currently looking through `upper`, therefore, look for any variables for which
        // `a <: b`, where `a` is the current node.
        let lookup = self.apply_constraints_prepare_constraints(Bound::Lower, bump);

        // We do a backwards pass over the graph to apply any upper constraints in order
        // Process nodes in reverse topological order for upper bound resolution
        let topo = topological_sort_in(graph, bump).expect("expected dag after anti-symmetry run");

        for index in topo.into_iter().rev() {
            let id = graph.node(index);
            let kind = self.unification.variables[id.into_usize()];

            let Some((_, variable_constraint)) = variables.get_mut(&kind) else {
                tracing::warn!(?kind, "variable is unconstrained");
                continue;
            };

            // Check for transitive constraints from ordering relationships
            // e.g., if we have constraints `X <: Y` and we're processing X,
            // then Y becomes an upper bound on X

            // CRITICAL: Skip adding transitive bounds if we already have an equality constraint.
            // This is essential for correctness, not just optimization. For example, given:
            //   _1 <: _2
            //   _1 = Number
            // If we applied _2 as an upper bound on _1, it could create inconsistencies since
            // the equality constraint is more specific and must take precedence. The type of _1
            // is already fully determined by the equality constraint.
            if let Some(transitive_constraints) = lookup.get(&id)
                && variable_constraint.equal.is_none()
            {
                for &VariableOrdering { lower: _, upper } in transitive_constraints {
                    if !self.lattice.contains_substitution(upper.kind) {
                        // This is a type that hasn't contributed to the lattice, meaning it's not
                        // relevant to our current inference process / has no upper bound that we
                        // can apply.
                        continue;
                    }

                    // this bound applies to us
                    variable_constraint
                        .upper
                        .push(self.lattice.intern_type(PartialType {
                            span: upper.origin.span,
                            kind: self.lattice.intern_kind(upper.kind.into_type_kind()),
                        }));
                }
            }

            // Compute the join (least upper bound) of all upper bounds
            let upper = variable_constraint
                .upper
                .iter()
                .copied()
                .reduce(|lhs, rhs| self.lattice.join(lhs, rhs));

            // If there's no equality constraint but we have an upper bound,
            // add the upper bound to the substitution map for future resolution
            if variable_constraint.equal.is_none()
                && let Some(upper) = upper
            {
                // Insert into substitution map, so that future resolvers can use it
                let substitution = self
                    .lattice
                    .substitution_mut()
                    .expect("substition should have been set previously");

                substitution.insert(kind, upper);
            }

            variable_constraint.upper.clear();
            if let Some(upper) = upper {
                variable_constraint.upper.push(upper);
            }
        }

        // Clear substitution to avoid unintended effects in later operations
        self.lattice.clear_substitution();
    }

    /// Applies constraints to the type lattice.
    ///
    /// Coordinates three-phase constraint resolution:
    /// 1. **Collection**: Group constraints by target variables
    /// 2. **Forward pass**: Resolve lower bounds in topological order
    /// 3. **Backward pass**: Resolve upper bounds in reverse topological order
    fn apply_constraints(
        &mut self,
        graph: &Graph,
        bump: &Bump,
        variables: &mut FastHashMap<VariableKind, (Variable, VariableConstraint)>,
        selections: &mut Vec<SelectionConstraint<'heap>>,
    ) {
        // Step 1.4: First collect all constraints by variable
        self.collect_constraints(variables, selections);

        // Step 1.5: Perform the forward pass to resolve lower bounds
        self.apply_constraints_forwards(graph, bump, variables);

        // Step 1.6: Perform the backward pass to resolve upper bounds
        self.apply_constraints_backwards(graph, bump, variables);
    }

    /// Validates constraints and determines final variable types.
    ///
    /// Verifies:
    /// - **Bound compatibility**: Lower bounds are subtypes of upper bounds
    /// - **Equality compatibility**: Equality constraints compatible with bounds
    /// - **Constraint coverage**: All variables have sufficient constraints
    ///
    /// Selects most specific type per variable: equality > lower bounds > upper bounds.
    fn solve_constraints(
        &mut self,
        constraints: &FastHashMap<VariableKind, (Variable, VariableConstraint)>,
        substitutions: &mut FastHashMap<VariableKind, TypeId>,
    ) {
        // Prepare a substitution map using the existing equality constraints
        // This allows us to use these equalities when verifying other constraints
        let mut substitution = Substitution::new(
            self.unification.lookup(),
            FastHashMap::with_capacity_and_hasher(
                constraints.len(),
                foldhash::fast::RandomState::default(),
            ),
        );

        for (&kind, (_, constraint)) in constraints {
            if let Some(constraint) = constraint.equal {
                substitution.insert(kind, constraint);
            }
        }

        self.lattice.set_substitution(substitution);

        // Because we substitute during the forward passes, we do not need to verify the constraints
        // again *or* do it in a specific order. The substitutions have already been applied for the
        // lower and upper bounds respectively.

        for (&kind, (variable, constraint)) in constraints {
            let variable = *variable;
            let constraint = constraint.finish();

            // First, verify that lower and upper bounds are compatible
            // (i.e., lower <: upper)
            if let EvaluatedVariableConstraint {
                equal: _,
                lower: Some(lower),
                upper: Some(upper),
            } = constraint
                && !self.lattice.is_subtype_of(lower, upper)
            {
                // Report error: incompatible bounds
                self.diagnostics.push(bound_constraint_violation(
                    &self.lattice,
                    variable,
                    self.lattice.r#type(lower),
                    self.lattice.r#type(upper),
                ));

                continue;
            }

            // Handle different constraint patterns to determine the final type
            match constraint {
                // If there's no constraint, we can't infer anything
                EvaluatedVariableConstraint {
                    equal: None,
                    lower: None,
                    upper: None,
                } => {
                    self.diagnostics.push(unconstrained_type_variable(variable));
                }
                // in case there's a single constraint we can simply just use that type
                EvaluatedVariableConstraint {
                    equal: Some(constraint),
                    lower: None,
                    upper: None,
                }
                | EvaluatedVariableConstraint {
                    equal: None,
                    lower: Some(constraint),
                    upper: None,
                }
                | EvaluatedVariableConstraint {
                    equal: None,
                    lower: None,
                    upper: Some(constraint),
                } => {
                    substitutions.insert(kind, constraint);
                }
                EvaluatedVariableConstraint {
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
                            self.lattice.r#type(lower),
                            self.lattice.r#type(equal),
                        ));

                        continue;
                    }

                    if let Some(upper) = upper
                        && !self.lattice.is_subtype_of(equal, upper)
                    {
                        self.diagnostics.push(incompatible_upper_equal_constraint(
                            &self.lattice,
                            variable,
                            self.lattice.r#type(equal),
                            self.lattice.r#type(upper),
                        ));

                        continue;
                    }

                    substitutions.insert(kind, equal);
                }
                EvaluatedVariableConstraint {
                    equal: None,
                    lower: Some(lower),
                    upper: Some(_),
                } => {
                    // We prefer to set the lower bound before the upper bound, even if both exist
                    // This is because a lower bound is typically more specific and useful
                    substitutions.insert(kind, lower);
                }
            }
        }

        self.lattice.clear_substitution();
    }

    /// Verifies all registered variables have been constrained.
    ///
    /// Variables without constraints generate floating variable diagnostics.
    fn verify_constrained(
        &mut self,
        lookup: &VariableLookup,
        variables: &FastHashMap<VariableKind, (Variable, VariableConstraint)>,
    ) {
        for &variable in &self.unification.variables {
            let root = lookup[variable];
            if !variables.contains_key(&root) {
                self.diagnostics
                    .push(unconstrained_type_variable_floating(&self.lattice));
            }
        }
    }

    /// Simplifies type substitutions to canonical forms.
    ///
    /// Reduces complex types to concise representations, improving error message readability and
    /// eliminating redundant type structure.
    fn simplify_substitutions(
        &mut self,
        lookup: VariableLookup,
        substitutions: &mut FastHashMap<VariableKind, TypeId>,
    ) {
        // Now that everything is solved, go over each substitution and simplify it
        // Make the simplifier aware of the substitutions
        self.simplify
            .set_substitution(Substitution::new(lookup, substitutions.clone()));

        for type_id in substitutions.values_mut() {
            *type_id = self.simplify.simplify(*type_id);
        }
    }

    /// Resolves selection constraints (field access, subscript operations).
    ///
    /// Performs lattice projections to resolve constraints. Successfully resolved constraints
    /// generate new equality or ordering constraints. Unresolvable constraints are deferred
    /// to the next iteration.
    ///
    /// # Returns
    ///
    /// `true` if any constraints were resolved, `false` if no progress was made.
    fn solve_selection_constraints(
        &mut self,
        substitution: Substitution,
        selections: &mut Vec<SelectionConstraint<'heap>>,
    ) -> bool {
        self.lattice.set_substitution(substitution);

        let mut made_progress = false;

        // Solve selection constraints, we do this by iterating over the selection constraints, and
        // then try solving them, if we can't solve them, we add them to the constraints vector
        // again. We also keep track of the progress, if we haven't made any progress, we stop, as
        // we've reached a fix-point, which is unsolvable. These then need to be reported.
        for selection in selections.drain(..) {
            match selection {
                SelectionConstraint::Projection {
                    subject,
                    field,
                    output,
                } => {
                    // Check if the subject is concrete, and can be accessed.
                    let subject_type = subject.r#type(self.lattice.environment);
                    let field = match self.lattice.projection(subject_type.id, field) {
                        Projection::Pending => {
                            // The projection is pending, we need to wait for it to be resolved.
                            // We add the constraint back to the list of constraints to be solved.
                            self.constraints.push(Constraint::Selection(selection));

                            // In case we do not make any progress, add an error (will be cleared
                            // every iteration)
                            self.diagnostics.push(unresolved_selection_constraint(
                                selection,
                                self.lattice.environment,
                            ));
                            continue;
                        }
                        Projection::Error => {
                            // While an error has occurred, we add the constraint back to the list,
                            // so that another iteration can attempt to resolve it (it will fail).
                            // This way we'll persist the error throughout fix-point iteration.
                            self.constraints.push(Constraint::Selection(selection));
                            continue;
                        }
                        Projection::Resolved(field) => field,
                    };

                    made_progress = true;

                    let field = self.lattice.r#type(field);

                    match field.into_variable() {
                        Some(field_variable) => {
                            // given `a <: b` and `b <: a`, we'll condense down to `a = b`
                            self.constraints.push(Constraint::Ordering {
                                lower: field_variable,
                                upper: output,
                            });
                            self.constraints.push(Constraint::Ordering {
                                lower: output,
                                upper: field_variable,
                            });
                        }
                        None => {
                            // discharge equality constraint between the field and the output type
                            self.constraints.push(Constraint::Equals {
                                variable: output,
                                r#type: field.id,
                            });
                        }
                    }
                }
                #[expect(clippy::todo)]
                SelectionConstraint::Subscript {
                    subject: _,
                    index: _,
                    output: _,
                } => {
                    todo!("https://linear.app/hash/issue/H-4545/hashql-implement-subscript-type-inferencechecking");
                }
            }
        }

        self.lattice.clear_substitution();

        made_progress
    }

    /// Verifies constraint system reached a valid fix-point.
    ///
    /// Only selection constraints should remain as unresolvable constraints.
    /// All other constraint types should have been processed and removed.
    fn verify_solved_constraint_system(&mut self) {
        for constraint in self.constraints.drain(..) {
            match constraint {
                Constraint::Selection(_) => {
                    // these might still exist, because we haven't made any progress, but(!) they
                    // should be the only ones that survive
                }
                _ => unreachable!(
                    "only selection constraints can be remaining on a fix-point system"
                ),
            }
        }
    }

    /// Solves the constraint system via fix-point iteration.
    ///
    /// # Algorithm
    ///
    /// 1. **Fix-point iteration** until convergence:
    ///    - Register variables in lattice environment
    ///    - Solve anti-symmetry constraints (`A <: B ∧ B <: A ⟹ A = B`)
    ///    - Set up variable substitutions
    ///    - Collect constraints per variable
    ///    - Apply forward/backward constraint passes
    ///    - Verify all variables are constrained
    ///    - Validate constraints and compute substitutions
    /// 2. **Simplification** to canonical forms
    /// 3. **Validation** of final constraint system
    /// 4. **Diagnostic collection** for error reporting
    ///
    /// # Returns
    ///
    /// Substitution mapping variables to inferred types and any diagnostics.
    #[must_use]
    pub fn solve(mut self) -> (Substitution, Diagnostics) {
        // This is the perfect use of a bump allocator, which is suited for phase-based memory
        // allocation. Each fix-point iteration requires temporary data structures that we can
        // reclaim and re-use, reducing memory usage. The bump allocator's memory consumption
        // stabilizes after the first iteration since each pass uses approximately
        // the same amount of memory.
        let mut bump = Bump::new();

        let mut graph = Graph::new(&mut self.unification);

        // These need to be initialized *after* upsert, to ensure that the capacity is correct
        let mut variables = fast_hash_map(self.unification.lookup.len());
        let mut substitution = fast_hash_map(self.unification.lookup.len());
        let mut selections = Vec::with_capacity(self.unification.lookup.len());

        let mut lookup = VariableLookup::new(FastHashMap::default());
        // Ensure that we run at least once, this is required, so that `verify_constrained` can
        // be called, and a diagnostic can be issued.
        let mut force_validation_pass = true;
        let mut made_progress = true;

        // Fix-point iteration - continue solving until no new constraints are generated or a
        // fix-point is reached
        while force_validation_pass || (!self.constraints.is_empty() && made_progress) {
            force_validation_pass = false;
            made_progress = false;

            // Clear the diagnostics this round, so that they do not pollute the next round
            self.diagnostics.clear();
            self.lattice.take_diagnostics();

            // Step 1.1: Register all variables with the unification system (including any new ones)
            self.upsert_variables(&mut graph);

            // Step 1.2: Solve anti-symmetry constraints (A <: B and B <: A implies A = B)
            self.solve_anti_symmetry(&mut graph, &mut variables, &bump);

            lookup = self.unification.lookup();
            // Step 1.3: Set the variable substitutions in the lattice
            // This makes sure that `equal` constraints are more lax when comparing equal values
            self.lattice.set_variables(lookup.clone());

            // Steps 1.4, 1.5, 1.6: Apply constraints through collection, forward, and backward
            // passes
            self.apply_constraints(&graph, &bump, &mut variables, &mut selections);

            // Step 1.7: Verify that all variables have been constrained
            self.verify_constrained(&lookup, &variables);

            // Step 1.8: Validate constraints and determine final types
            substitution.clear();
            self.solve_constraints(&variables, &mut substitution);

            self.constraints.clear();

            if !selections.is_empty() {
                // By making this conditional it means that we can save on the clone if not
                // required.
                let substitution = Substitution::new(lookup.clone(), substitution.clone());
                made_progress = self.solve_selection_constraints(substitution, &mut selections);
            }

            // Reset the bump allocator for the next iteration to avoid memory growth
            bump.reset();
        }

        // Step 2: Simplify the final substitutions
        self.simplify_substitutions(lookup.clone(), &mut substitution);
        let substitution = Substitution::new(lookup, substitution);

        // Step 3: Verify that the system has been solved
        self.verify_solved_constraint_system();

        // Step 4: Collect all diagnostics from the solving process
        let mut diagnostics = self.diagnostics;
        diagnostics.merge(self.persistent_diagnostics);
        diagnostics.merge(self.lattice.take_diagnostics());
        if let Some(simplify) = self.simplify.take_diagnostics() {
            diagnostics.merge(simplify);
        }

        (substitution, diagnostics)
    }
}
