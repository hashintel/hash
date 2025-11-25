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
mod tests;
mod topo;

use bumpalo::Bump;
use ena::unify::{InPlaceUnificationTable, NoError, UnifyKey as _};
use hashql_diagnostics::DiagnosticIssues;

use self::{
    graph::{EdgeKind, Graph},
    tarjan::Tarjan,
    topo::topological_sort_in,
};
use super::{
    Constraint, DeferralDepth, ResolutionStrategy, SelectionConstraint, Substitution, Variable,
    VariableKind,
    variable::{VariableId, VariableLookup, VariableProvenance},
};
use crate::{
    collections::{
        FastHashMap, SmallVec, fast_hash_map_with_capacity, fast_hash_map_with_capacity_in,
    },
    r#type::{
        PartialType, TypeId,
        environment::{InferenceEnvironment, LatticeEnvironment, Variance},
        error::{
            TypeCheckDiagnosticIssues, TypeCheckStatus, bound_constraint_violation,
            conflicting_equality_constraints, incompatible_lower_equal_constraint,
            incompatible_upper_equal_constraint, unconstrained_type_variable,
            unconstrained_type_variable_floating, unresolved_selection_constraint,
            unsatisfiable_upper_constraint,
        },
        kind::{PrimitiveType, TypeKind, UnionType},
        lattice::{Projection, Subscript},
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
            let id = self.table.new_key(variable.provenance());
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
    #[cfg(test)]
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

    fn root_kind(&mut self, id: VariableId) -> VariableKind {
        let root = self.table.find(id);

        self.variables[root.into_usize()]
    }

    fn provenance(&mut self, variable: VariableKind) -> VariableProvenance {
        let id = self.root_id(variable);

        self.table.probe_value(id)
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
    pub(crate) fn lookup(&mut self) -> VariableLookup {
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

/// Tracks the satisfiability status of different constraint types for a type variable.
///
/// This structure maintains flags indicating whether each category of constraint
/// (currently only upper bounds) can be satisfied without creating logical contradictions.
/// Used during constraint resolution to detect and report unsatisfiable constraint systems.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct VariableConstraintSatisfiability {
    /// Whether upper bound constraints are satisfiable.
    ///
    /// Set to `false` when upper bound resolution results in bottom types, indicating an
    /// impossible constraint combination.
    upper: bool,
}

impl Default for VariableConstraintSatisfiability {
    fn default() -> Self {
        Self { upper: true }
    }
}

impl VariableConstraintSatisfiability {
    const fn merge(&mut self, other: Self) {
        self.upper &= other.upper;
    }
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
    /// The satisfiability of the variable constraint
    satisfiability: VariableConstraintSatisfiability,
}

impl VariableConstraint {
    fn finish(
        &self,
    ) -> (
        EvaluatedVariableConstraint,
        VariableConstraintSatisfiability,
    ) {
        debug_assert!(
            self.lower.len() <= 1,
            "lower bound should be either empty or contain exactly one type"
        );
        debug_assert!(
            self.upper.len() <= 1,
            "upper bound should be either empty or contain exactly one type"
        );

        let constraint = EvaluatedVariableConstraint {
            equal: self.equal,
            lower: self.lower.first().copied(),
            upper: self.upper.last().copied(),
        };

        (constraint, self.satisfiability)
    }
}

/// Final constraints after lattice reduction.
///
/// Contains the reduced constraints (meet for lower bounds, join for upper bounds)
/// that determine the variable's inferred type.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
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
    /// Environment to discharge additional constraints
    inference: InferenceEnvironment<'env, 'heap>,

    /// Diagnostics for type error reporting
    diagnostics: TypeCheckDiagnosticIssues,
    persistent_diagnostics: TypeCheckDiagnosticIssues,

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
    pub(crate) fn new(mut inference: InferenceEnvironment<'env, 'heap>) -> Self {
        let unification = Unification::new();
        let constraints = inference.take_constraints();

        let mut lattice = LatticeEnvironment::new(inference.environment);
        lattice.without_simplify();
        lattice.set_inference_enabled(true);

        Self {
            lattice,
            inference,

            diagnostics: DiagnosticIssues::new(),
            persistent_diagnostics: DiagnosticIssues::new(),

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
                    satisfiability,
                } = &mut lhs_constraint;

                lower.append(&mut rhs_constraint.lower);
                upper.append(&mut rhs_constraint.upper);

                satisfiability.merge(rhs_constraint.satisfiability);

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
            let edges = match constraint {
                Constraint::Ordering { lower, upper } => {
                    [Some((EdgeKind::SubtypeOf, lower, upper)), None]
                }
                Constraint::Dependency { source, target } => {
                    [Some((EdgeKind::DependsOn, source, target)), None]
                }
                Constraint::Unify { lhs, rhs } => [
                    Some((EdgeKind::SubtypeOf, lhs, rhs)),
                    Some((EdgeKind::SubtypeOf, rhs, lhs)),
                ],
                Constraint::UpperBound { .. }
                | Constraint::LowerBound { .. }
                | Constraint::Equals { .. }
                | Constraint::Selection(..) => continue,
            };

            for (kind, source, target) in edges.into_iter().flatten() {
                let source = self.unification.lookup[&source.kind];
                let target = self.unification.lookup[&target.kind];

                graph.insert_edge(kind, source, target);
            }
        }

        // Run Tarjan's SCC algorithm to find strongly connected components
        let tarjan = Tarjan::new_in(graph, EdgeKind::SubtypeOf, bump);

        // For each strongly connected component, unify all variables in the component
        // since they must be equal due to anti-symmetry of the subtyping relation
        for scc in tarjan.compute() {
            for [lhs, rhs] in scc.iter().map_windows(|values: &[_; 2]| *values) {
                let lhs_id = graph.node(lhs as usize);
                let rhs_id = graph.node(rhs as usize);

                let lhs = self.unification.root_kind(lhs_id);
                let rhs = self.unification.root_kind(rhs_id);

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
        selections: &mut Vec<(
            SelectionConstraint<'heap>,
            ResolutionStrategy,
            DeferralDepth,
        )>,
    ) {
        for &constraint in &self.constraints {
            match constraint {
                Constraint::UpperBound { variable, bound } => {
                    if self.lattice.is_alias(bound, variable.kind) {
                        // This bound does not contribute to the variable's type, as it is just `T
                        // <: T` which is just true.
                        continue;
                    }

                    // Find the canonical representative for this variable
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    // Add the upper bound to this variable's constraints
                    constraint.upper.push(bound);
                }
                Constraint::LowerBound { variable, bound } => {
                    if self.lattice.is_alias(bound, variable.kind) {
                        // This bound does not contribute to the variable's type, as it is just `T
                        // <: T` which is just true.
                        continue;
                    }

                    // Find the canonical representative for this variable
                    let root = self.unification.root(variable.kind);
                    let (_, constraint) = constraints
                        .entry(root)
                        .or_insert_with(|| (variable, VariableConstraint::default()));

                    // Add the lower bound to this variable's constraints
                    constraint.lower.push(bound);
                }
                Constraint::Equals { variable, r#type } => {
                    if self.lattice.is_alias(r#type, variable.kind) {
                        // This equality does not contribute to the variable's type, as it is just
                        // `T = T` which is just true.
                        continue;
                    }

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
                Constraint::Dependency { source, target } => {
                    let source_root = self.unification.root(source.kind);
                    let _: Result<_, _> = constraints
                        .try_insert(source_root, (source, VariableConstraint::default()));

                    let target_root = self.unification.root(target.kind);
                    let _: Result<_, _> = constraints
                        .try_insert(target_root, (target, VariableConstraint::default()));
                }
                Constraint::Unify { lhs, rhs } => {
                    let lhs_root = self.unification.root(lhs.kind);
                    let _: Result<_, _> =
                        constraints.try_insert(lhs_root, (lhs, VariableConstraint::default()));

                    let rhs_root = self.unification.root(rhs.kind);
                    let _: Result<_, _> =
                        constraints.try_insert(rhs_root, (rhs, VariableConstraint::default()));
                }
                constraint @ Constraint::Selection(mut selection, mode, depth) => {
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

                    selections.push((selection, mode, depth));
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
        let mut substitution = Substitution::new(
            self.unification.lookup(),
            fast_hash_map_with_capacity(variables.len()),
        );

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
    ) -> FastHashMap<VariableId, Vec<VariableOrdering, &'bump Bump>, &'bump Bump> {
        let mut lookup: FastHashMap<VariableId, Vec<VariableOrdering, &'bump Bump>, &'bump Bump> =
            fast_hash_map_with_capacity_in(self.unification.variables.len(), heap);

        for &constraint in &self.constraints {
            let Constraint::Ordering { lower, upper } = constraint else {
                continue;
            };

            let lower_kind = self.unification.root(lower.kind);
            let upper_kind = self.unification.root(upper.kind);

            let lower_id = self.unification.lookup[&lower_kind];
            let upper_id = self.unification.lookup[&upper_kind];

            // Check if this is a self-referential constraint, which should be skipped, because they
            // have already been unified.
            if lower_id == upper_id {
                continue;
            }

            let entry = lookup
                .entry(match lookup_by {
                    // Index by the variable based on lookup direction
                    Bound::Lower => lower_id,
                    Bound::Upper => upper_id,
                })
                .or_insert_with(|| Vec::new_in(heap));

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
        let topo = topological_sort_in(graph, EdgeKind::SubtypeOf, bump)
            .expect("expected dag after anti-symmetry run");

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
            // Combine into the loosest lower bound (join - least upper bound)
            let lower = variable_constraint
                .lower
                .iter()
                .copied()
                .reduce(|lhs, rhs| self.lattice.join(lhs, rhs));

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
                let lower = self.lattice.simplify(lower);
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

        let topo = topological_sort_in(graph, EdgeKind::Any, bump)
            .expect("expected dag after anti-symmetry run");

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

            // Combine into the tightest upper bound (meet - greatest lower bound)
            // Track if all bounds were bottom types.
            let only_bottoms = variable_constraint
                .upper
                .iter()
                .all(|&upper| self.lattice.is_bottom(upper));
            let upper = variable_constraint
                .upper
                .iter()
                .copied()
                .reduce(|lhs, rhs| self.lattice.meet(lhs, rhs));

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
                let upper = self.lattice.simplify(upper);
                let is_bottom = self.lattice.is_bottom(upper);

                // Mark as unsatisfiable if we had valid constraints that resolved to an impossible
                // type (bottom). This indicates conflicting upper bound constraints.
                // Example: if X <: String and X <: Number, their meet is bottom (impossible).
                let unsatisfiable = !only_bottoms && is_bottom;

                variable_constraint.upper.push(upper);
                variable_constraint.satisfiability.upper &= !unsatisfiable;
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
        selections: &mut Vec<(
            SelectionConstraint<'heap>,
            ResolutionStrategy,
            DeferralDepth,
        )>,
    ) {
        // Step 1.4: First collect all constraints by variable
        self.collect_constraints(variables, selections);

        // Step 1.5: Perform the forward pass to resolve lower bounds
        self.apply_constraints_forwards(graph, bump, variables);

        // Step 1.6: Perform the backward pass to resolve upper bounds
        self.apply_constraints_backwards(graph, bump, variables);
    }

    /// Validates that the given constraint is satisfiable for the specified variable.
    ///
    /// This function checks whether the evaluated constraint can be satisfied without
    /// creating logical inconsistencies. Currently only validates upper bound constraints
    /// by checking if an upper bound was marked as unsatisfiable during constraint
    /// propagation.
    ///
    /// # Returns
    ///
    /// Returns `true` if the constraint is satisfiable, `false` otherwise. When unsatisfiable,
    /// appropriate diagnostic errors are pushed to the solver's diagnostic collection.
    #[expect(
        clippy::useless_let_if_seq,
        reason = "More satisfiable checks to be added later"
    )]
    fn solve_constraints_satisfiable(
        &mut self,
        variable: Variable,
        constraint: EvaluatedVariableConstraint,
        satisfiable: VariableConstraintSatisfiability,
    ) -> bool {
        let mut is_satisfiable = true;

        // Check if we have an upper bound constraint that was marked as unsatisfiable during
        // constraint propagation (e.g., when multiple upper bounds resulted in a bottom type)
        if let EvaluatedVariableConstraint {
            upper: Some(upper), ..
        } = constraint
            && !satisfiable.upper
        {
            self.diagnostics.push(unsatisfiable_upper_constraint(
                &self.lattice,
                upper,
                variable,
            ));

            is_satisfiable = false;
        }

        is_satisfiable
    }

    fn solve_constraints_inference(
        &mut self,
        EvaluatedVariableConstraint {
            equal,
            lower,
            upper,
        }: EvaluatedVariableConstraint,
    ) {
        let mut discharge = SmallVec::with_capacity(6);

        if let Some(lower) = lower
            && !self.lattice.is_concrete(lower)
        {
            // discharge (if available) `lower <: equal` and `lower <: upper`
            if let Some(equal) = equal {
                discharge.push((lower, equal));
            }

            if let Some(upper) = upper {
                discharge.push((lower, upper));
            }
        }

        if let Some(equal) = equal
            && !self.lattice.is_concrete(equal)
        {
            // discharge (if available) `lower <: equal` and `equal <: upper`
            if let Some(lower) = lower {
                discharge.push((lower, equal));
            }

            if let Some(upper) = upper {
                discharge.push((equal, upper));
            }
        }

        if let Some(upper) = upper
            && !self.lattice.is_concrete(upper)
        {
            // discharge (if available) `equal <: upper` and `lower <: upper`
            if let Some(equal) = equal {
                discharge.push((equal, upper));
            }

            if let Some(lower) = lower {
                discharge.push((lower, upper));
            }
        }

        discharge.sort_unstable();
        discharge.dedup();

        for (subtype, supertype) in discharge {
            self.inference
                .collect_constraints(Variance::Covariant, subtype, supertype);
        }
    }

    /// Validates constraints and determines final variable types.
    ///
    /// Verifies:
    /// - **Bound compatibility**: Lower bounds are subtypes of upper bounds
    /// - **Equality compatibility**: Equality constraints compatible with bounds
    /// - **Constraint coverage**: All variables have sufficient constraints
    ///
    /// Selects most specific type per variable: equality > lower bounds > upper bounds.
    #[expect(clippy::too_many_lines)]
    fn solve_constraints(
        &mut self,
        graph: &Graph,
        bump: &Bump,
        constraints: &FastHashMap<VariableKind, (Variable, VariableConstraint)>,
        substitutions: &mut FastHashMap<VariableKind, TypeId>,
        unconstrained: &mut Vec<Variable, &Bump>,
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
        let scc = Tarjan::new_in(graph, EdgeKind::Any, bump).compute(); // The scc are in reverse topological order
        let topo = scc.into_iter().flatten();

        for index in topo {
            let id = graph.node(index as usize);
            let kind = self.unification.root_kind(id);

            let Some((variable, constraint)) = constraints.get(&kind) else {
                tracing::warn!(?kind, "No constraint generated for variable");
                continue;
            };

            let variable = *variable;
            let (constraint, satisfiable) = constraint.finish();

            self.solve_constraints_inference(constraint);

            // First, verify that lower and upper bounds are compatible
            // (i.e., lower <: upper)
            if let EvaluatedVariableConstraint {
                equal: _,
                lower: Some(lower),
                upper: Some(upper),
            } = constraint
                && !self
                    .lattice
                    .is_subtype_of(Variance::Covariant, lower, upper)
            {
                // Report error: incompatible bounds
                self.diagnostics.push(bound_constraint_violation(
                    self.lattice.environment,
                    variable,
                    self.lattice.r#type(lower),
                    self.lattice.r#type(upper),
                ));

                continue;
            }

            if !self.solve_constraints_satisfiable(variable, constraint, satisfiable) {
                continue;
            }

            let provenance = self.unification.provenance(kind);

            // Handle different constraint patterns to determine the final type
            let constraint = match constraint {
                // If there's no constraint, we can't infer anything
                // This will be caught during type checking either way, but is likely a programming
                // error. This is *only* the case if the variable is a hole, and not generic. As
                // generics can be completely legitimately unconstrained.
                EvaluatedVariableConstraint {
                    equal: None,
                    lower: None,
                    upper: None,
                } if provenance == VariableProvenance::Generic => {
                    unconstrained.push(variable);
                    continue;
                }
                EvaluatedVariableConstraint {
                    equal: None,
                    lower: None,
                    upper: None,
                } => {
                    unconstrained.push(variable);
                    self.diagnostics.push(unconstrained_type_variable(variable));
                    continue;
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
                } => constraint,
                EvaluatedVariableConstraint {
                    equal: Some(equal),
                    lower,
                    upper,
                } => {
                    // We need to check that both the lower and upper bounds are compatible with the
                    // equal bound
                    if let Some(lower) = lower
                        && !self
                            .lattice
                            .is_subtype_of(Variance::Covariant, lower, equal)
                    {
                        self.diagnostics.push(incompatible_lower_equal_constraint(
                            self.lattice.environment,
                            variable,
                            self.lattice.r#type(lower),
                            self.lattice.r#type(equal),
                        ));

                        continue;
                    }

                    if let Some(upper) = upper
                        && !self
                            .lattice
                            .is_subtype_of(Variance::Covariant, equal, upper)
                    {
                        self.diagnostics.push(incompatible_upper_equal_constraint(
                            &self.lattice,
                            variable,
                            self.lattice.r#type(equal),
                            self.lattice.r#type(upper),
                        ));

                        continue;
                    }

                    equal
                }
                EvaluatedVariableConstraint {
                    equal: None,
                    lower: Some(lower),
                    upper: Some(_),
                } => {
                    // We prefer to set the lower bound before the upper bound, even if both exist
                    // This is because a lower bound is typically more specific and useful
                    lower
                }
            };

            substitutions.insert(kind, constraint);
            self.lattice
                .substitution_mut()
                .unwrap_or_else(|| unreachable!())
                .insert(kind, constraint);
        }

        self.lattice.clear_substitution();
    }

    /// Verifies all registered variables have been constrained.
    ///
    /// Variables without constraints generate floating variable diagnostics.
    fn verify_constrained(
        &mut self,
        graph: &Graph,
        variables: &FastHashMap<VariableKind, (Variable, VariableConstraint)>,
    ) {
        for node in graph.nodes() {
            let kind = self.unification.variables[node.into_usize()];
            let provenance = self.unification.table.probe_value(node);

            if provenance == VariableProvenance::Generic {
                // Generic variables can be kept unconstrained
                continue;
            }

            if !variables.contains_key(&kind) {
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
        self.lattice
            .set_substitution(Substitution::new(lookup, substitutions.clone()));

        for type_id in substitutions.values_mut() {
            *type_id = self.lattice.simplify(*type_id);
        }

        self.lattice.clear_substitution();
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
    #[expect(clippy::too_many_lines)]
    fn solve_selection_constraints(
        &mut self,
        substitution: Substitution,
        selections: &mut Vec<(
            SelectionConstraint<'heap>,
            ResolutionStrategy,
            DeferralDepth,
        )>,
    ) -> bool {
        self.lattice.set_substitution(substitution);

        let mut made_progress = false;

        // Solve selection constraints, we do this by iterating over the selection constraints, and
        // then try solving them, if we can't solve them, we add them to the constraints vector
        // again. We also keep track of the progress, if we haven't made any progress, we stop, as
        // we've reached a fix-point, which is unsolvable. These then need to be reported.
        for (selection, mut mode, depth) in selections.drain(..) {
            match selection {
                SelectionConstraint::Projection {
                    subject,
                    field,
                    output,
                } => {
                    // Check if the subject is concrete, and can be accessed.
                    let mut subject_type = subject.r#type(self.lattice.environment);
                    if mode == ResolutionStrategy::Simplify {
                        // Simplify the subject type. This will remove any unnecessary match arms,
                        // but will mean that we're no longer able to infer any underlying type (if
                        // present).
                        let simplified = self.lattice.simplify(subject_type.id);
                        subject_type = self.lattice.r#type(simplified);
                    }

                    let field = match self.lattice.projection(subject_type.id, field) {
                        Projection::Pending => {
                            // The projection is pending, we need to wait for it to be resolved.
                            // We add the constraint back to the list of constraints to be solved.
                            self.constraints.push(Constraint::Selection(
                                selection,
                                mode,
                                depth.increment(),
                            ));

                            // In case we do not make any progress, add an error (will be cleared
                            // every iteration)
                            self.diagnostics.push(unresolved_selection_constraint(
                                selection,
                                self.lattice.environment,
                            ));
                            continue;
                        }
                        Projection::Error => {
                            // Try to fallback to simplify (if we haven't already), in that case we
                            // have made progress, as we need to try again, but this time
                            // simplifying the type.
                            made_progress |= mode.degenerate();

                            // While an error has occurred, we add the constraint back to the list,
                            // so that another iteration can attempt to resolve it (it will fail).
                            // This way we'll persist the error throughout fix-point iteration.
                            self.constraints
                                .push(Constraint::Selection(selection, mode, depth));
                            continue;
                        }
                        Projection::Resolved(field) => field,
                    };

                    made_progress = true;

                    let field = self.lattice.r#type(field);

                    match field.into_variable() {
                        Some(field_variable) => {
                            self.constraints.push(Constraint::Unify {
                                lhs: field_variable,
                                rhs: output,
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
                SelectionConstraint::Subscript {
                    subject,
                    index,
                    output,
                } => {
                    let mut subject_type = subject.r#type(self.lattice.environment);
                    let mut index_type = index.r#type(self.lattice.environment);

                    if mode == ResolutionStrategy::Simplify {
                        // Simplify the subject type. This will remove any unnecessary match arms,
                        // but will mean that we're no longer able to infer any underlying type (if
                        // present).
                        let simplified = self.lattice.simplify(subject_type.id);
                        subject_type = self.lattice.r#type(simplified);

                        let simplified = self.lattice.simplify(index_type.id);
                        index_type = self.lattice.r#type(simplified);
                    }

                    let value = match self.lattice.subscript(
                        subject_type.id,
                        index_type.id,
                        &mut self.inference,
                    ) {
                        Subscript::Pending => {
                            // The subscript is pending, we need to wait for it to be resolved.
                            // We add the constraint back to the list of constraints to be solved.
                            self.constraints.push(Constraint::Selection(
                                selection,
                                mode,
                                depth.increment(),
                            ));

                            // In case we do not make any progress, add an error (will be cleared
                            // every iteration)
                            self.diagnostics.push(unresolved_selection_constraint(
                                selection,
                                self.lattice.environment,
                            ));

                            // We may have issued additional constraints, to not risk any infinite
                            // loop, where we always issue additional constraints we only do so on
                            // the first iteration.
                            if self.inference.has_constraints() && depth.is_zero() {
                                // In that case we've actually made progress, because we have issued
                                // new constraints
                                made_progress = true;
                                self.inference.drain_constraints_into(&mut self.constraints);
                            }

                            continue;
                        }
                        Subscript::Error => {
                            // Try to fallback to simplify (if we haven't already), in that case we
                            // have made progress, as we need to try again, but this time
                            // simplifying the type.
                            made_progress |= mode.degenerate();

                            // While an error has occurred, we add the constraint back to the list,
                            // so that another iteration can attempt to resolve it (it will fail).
                            // This way we'll persist the error throughout fix-point iteration.
                            self.constraints
                                .push(Constraint::Selection(selection, mode, depth));
                            continue;
                        }
                        Subscript::Resolved(value) => value,
                    };

                    made_progress = true;

                    // Unlike `Projection` we must always discharge an equality constraints, because
                    // the value may be `Null` (in the future this might be changed to `Option`).
                    self.constraints.push(Constraint::Equals {
                        variable: output,
                        // value | Null
                        r#type: self.lattice.intern_type(PartialType {
                            span: output.span,
                            kind: self.lattice.intern_kind(TypeKind::Union(UnionType {
                                variants: self.lattice.intern_type_ids(&[
                                    value,
                                    self.lattice.intern_type(PartialType {
                                        span: output.span,
                                        kind: self
                                            .lattice
                                            .intern_kind(TypeKind::Primitive(PrimitiveType::Null)),
                                    }),
                                ]),
                            })),
                        }),
                    });
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
                Constraint::Selection(..) => {
                    // These might still exist, because we haven't made any progress, but(!) they
                    // should be the only ones that survive
                }
                Constraint::Unify { .. }
                | Constraint::UpperBound { .. }
                | Constraint::LowerBound { .. }
                | Constraint::Equals { .. }
                | Constraint::Ordering { .. }
                | Constraint::Dependency { .. } => unreachable!(
                    "only selection constraints can be remaining on a fix-point system"
                ),
            }
        }
    }

    /// Attempts to solve previously unconstrained variables using the generated substitution.
    ///
    /// This method handles variables that remain unconstrained after the initial constraint
    /// solving phase. Unconstrained variables can occur when we have constraint chains where
    /// intermediate variables lack sufficient bounds in one direction.
    ///
    /// For example, given constraints `A <: B` and `Integer <: B`, when trying to solve for
    /// the upper bound of `A`, we need to find any upper bound for `B`. However, if `B` only
    /// has a lower bound (`Integer`), then `A` stays unconstrained in the upper direction.
    ///
    /// This method resolves such cases by examining the constraint graph after reaching a
    /// fix-point and using the generated substitution to provide bounds for previously
    /// unconstrained variables. It cannot be performed earlier due to the constraint
    /// propagation strategy, which uses a forward-pass for lower bounds followed by a
    /// backward-pass for upper bounds.
    ///
    /// The method iterates through unconstrained variables and checks their graph connections
    /// (both incoming and outgoing edges) to see if any connected variables now have resolved
    /// types in the substitution. If so, it adds appropriate bound constraints.
    ///
    /// Returns `true` if any progress was made (new constraints were added), `false` otherwise.
    fn solve_unconstrained(
        &mut self,
        graph: &Graph,
        substitution: &FastHashMap<VariableKind, TypeId>,
        unconstrained: Vec<Variable, &Bump>,
    ) -> bool {
        let mut made_progress = false;

        for variable in unconstrained {
            let id = self.unification.root_id(variable.kind);

            for upper in graph.outgoing_edges(EdgeKind::SubtypeOf, id) {
                let kind = self.unification.root_kind(upper);

                if let Some(&bound) = substitution.get(&kind) {
                    self.constraints
                        .push(Constraint::UpperBound { variable, bound });

                    made_progress = true;
                }
            }

            for lower in graph.incoming_edges(EdgeKind::SubtypeOf, id) {
                let kind = self.unification.root_kind(lower);

                if let Some(&bound) = substitution.get(&kind) {
                    self.constraints
                        .push(Constraint::LowerBound { variable, bound });

                    made_progress = true;
                }
            }
        }

        made_progress
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
    ///
    /// # Errors
    ///
    /// Returns an error if the type inference fails.
    pub fn solve(mut self) -> TypeCheckStatus<Substitution> {
        // This is the perfect use of a bump allocator, which is suited for phase-based memory
        // allocation. Each fix-point iteration requires temporary data structures that we can
        // reclaim and re-use, reducing memory usage. The bump allocator's memory consumption
        // stabilizes after the first iteration since each pass uses approximately
        // the same amount of memory.
        let mut bump = Bump::new();

        let mut graph = Graph::new(&mut self.unification);

        // These need to be initialized *after* upsert, to ensure that the capacity is correct
        let mut variables = fast_hash_map_with_capacity(self.unification.lookup.len());
        let mut substitution = fast_hash_map_with_capacity(self.unification.lookup.len());
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
            self.lattice.clear_diagnostics();

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
            self.verify_constrained(&graph, &variables);

            // Step 1.8: Validate constraints and determine final types
            substitution.clear();
            let mut unconstrained = Vec::new_in(&bump);
            self.solve_constraints(
                &graph,
                &bump,
                &variables,
                &mut substitution,
                &mut unconstrained,
            );
            self.constraints.clear();

            // Check if there are any constraints that have been generated by the
            // `solve_constraints` due to any unsolved variables
            self.inference.drain_constraints_into(&mut self.constraints);
            made_progress |= !self.constraints.is_empty(); // If there are constraints, we made progress

            made_progress |= self.solve_unconstrained(&graph, &substitution, unconstrained);

            if !selections.is_empty() {
                // By making this conditional it means that we can save on the clone if not
                // required.
                let substitution = Substitution::new(lookup.clone(), substitution.clone());
                made_progress |= self.solve_selection_constraints(substitution, &mut selections);
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
        diagnostics.append(&mut self.persistent_diagnostics);
        diagnostics.append(&mut self.lattice.take_diagnostics());

        diagnostics.into_status(substitution)
    }
}
