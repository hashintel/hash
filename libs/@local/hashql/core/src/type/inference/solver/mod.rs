//! Type inference constraint solver.
//!
//! Implements a constraint-based type inference system using a fix-point
//! iteration algorithm. Handles subtyping relationships, equality constraints,
//! and structural dependencies to determine the most specific types for type variables.
//!
//! The main entry point is [`InferenceSolver`], which coordinates the entire solving
//! process through multiple phases:
//!
//! 1. **Fix-point iteration** - Repeat until convergence:
//!    1. Ensures variables are registered in the lattice environment
//!    2. Solves anti-symmetry constraints (where A <: B and B <: A implies A = B)
//!    3. Sets up variable substitutions in the lattice environment
//!    4. Collects constraints for each variable
//!    5. Applies forward constraint pass to resolve lower bounds
//!    6. Applies backward constraint pass to resolve upper bounds
//!    7. Verifies all variables are constrained
//!    8. Validates constraints and computes substitutions
//! 2. **Simplification** - Types are reduced to canonical forms
//! 3. **Validation** - Final constraint system verification
//! 4. **Diagnostic collection** - Gather all errors from the solving process
//!
//! Operates on a lattice-based type system where types form a partial order, which enables
//! efficient computation of meets (greatest lower bounds) and joins (least upper bounds).

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

/// Manages variable unification during type inference using a union-find data structure.
///
/// Tracks equivalence classes of type variables, allowing the solver to determine when multiple
/// variables represent the same type. When variables are unified through constraints like
/// anti-symmetry (`A <: B` and `B <: A`), they become part of the same equivalence class and share
/// the same constraints.
///
/// This unification table is maintained through:
/// - A union-find tables
/// - A bidirectional mapping between [`VariableKind`] and internal IDs
/// - Canonical representatives for each equivalence class
///
/// # Performance
///
/// The union-find operations have nearly constant amortized time complexity due to path compression
/// and union by rank optimizations provided by the underlying `ena` crate.
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
    /// Creates a new empty unification table for type variables.
    pub(crate) fn new() -> Self {
        Self {
            table: InPlaceUnificationTable::new(),
            variables: Vec::new(),
            lookup: FastHashMap::default(),
        }
    }

    /// Inserts a variable into the unification system or returns its existing ID.
    ///
    /// This method ensures that each unique [`VariableKind`] has exactly one corresponding ID in
    /// the unification table, maintaining the invariant that variables can be looked up
    /// consistently throughout the solving process.
    ///
    /// Any variable used should only be accessed through this method to ensure consistency.
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
    /// After unification, both variables will have the same canonical representative. The merging
    /// of the constraints must be handled separately. The root variable used is an implementation
    /// detail and can only be accessed by finding the new root node of either.
    /// If the constraints are not merged externally as well, constraints from either `lhs` or `rhs`
    /// may be lost.
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
    ///
    /// This method performs path compression to ensure efficient future lookups and returns the
    /// root ID that represents all variables in the same equivalence class.
    fn root_id(&mut self, variable: VariableKind) -> VariableId {
        let id = self.upsert_variable(variable);

        self.table.find(id)
    }

    /// Finds the canonical [`VariableKind`] for a variable's equivalence class.
    ///
    /// This is the primary method for constraint application, as all operations should be performed
    /// on the canonical representative to ensure consistency.
    fn root(&mut self, variable: VariableKind) -> VariableKind {
        let id = self.root_id(variable);

        self.variables[id.into_usize()]
    }

    /// Creates a lookup table mapping each variable to its canonical representative.
    ///
    /// This method produces a [`VariableLookup`] that can be used throughout the ystem to
    /// consistently resolve variables to their unified representatives. The lookup table is
    /// typically created after all unification operations are complete. Any future modifications
    /// won't be automatically reflected in the lookup table, it is simply a snapshot in time.
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

/// Represents the direction of a type bound constraint in the lattice.
///
/// Constraints establish directional relationships in the type lattice, where variables
/// can have both upper bounds (constraints from above) and lower bounds (constraints from below).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Bound {
    /// An upper bound constraint where the variable must be a subtype of the bound.
    /// For example, in `X <: T`, `T` is an upper bound on `X`.
    Upper,
    /// A lower bound constraint where the variable must be a supertype of the bound.
    /// For example, in `T <: X`, `T` is a lower bound on `X`.
    Lower,
}

/// A variable with its resolved unification information.
///
/// Bridges the gap between user-facing variables (with source spans for error reporting) and the
/// internal unification system (with IDs and canonical kinds). Maintains all necessary information
/// for both constraint processing and diagnostics.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct ResolvedVariable {
    /// The original variable from the source code (used for error reporting)
    origin: Variable,

    /// The internal ID for the variable in the unification system
    id: VariableId,
    /// The canonical kind of the variable after unification
    kind: VariableKind,
}

/// An ordering constraint representing a subtyping relationship.
///
/// This tracks a subtyping relationship where `lower <: upper`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct VariableOrdering {
    /// The variable that must be a subtype
    lower: ResolvedVariable,
    /// The variable that must be a supertype
    upper: ResolvedVariable,
}

/// Aggregated constraints for a single type variable during solving.
///
/// Collects all constraints that apply to a variable, organizing them
/// by type (equality, lower bounds, upper bounds). Multiple constraints of the same type are
/// collected and later reduced using lattice operations.
#[derive(Debug, PartialEq, Eq, Default)]
struct VariableConstraint {
    /// The exact type this variable must equal, if such a constraint exists
    equal: Option<TypeId>,
    /// Lower bound constraints (variable must be a supertype of these types)
    lower: SmallVec<TypeId>,
    /// Upper bound constraints (variable must be a subtype of these types)
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

/// Final constraints for a variable after lattice reduction.
///
/// After processing multiple constraints of each type through lattice operations
/// (meet for lower bounds, join for upper bounds), this structure contains the
/// final constraint of each kind that determines the variable's inferred type.
#[derive(Debug, PartialEq, Eq, Default)]
struct EvaluatedVariableConstraint {
    /// The final equality constraint, if any
    equal: Option<TypeId>,
    /// The final lower bound constraint, if any
    lower: Option<TypeId>,
    /// The final upper bound constraint, if any
    upper: Option<TypeId>,
}

/// The main type inference constraint solver.
///
/// Implements a fix-point iteration algorithm that resolves type constraints to determine the most
/// specific types for each variable. Operates on a lattice-based type system where types form a
/// partial order.
///
/// The solver handles multiple constraint types:
/// - **Equality constraints**: Variable must equal a specific type
/// - **Subtyping constraints**: Variable must be a subtype/supertype of another type
/// - **Selection constraints**: Field access that depends on the structure of a type
/// - **Ordering constraints**: Variables related through subtyping relationships
///
/// # Algorithm
///
/// The solving process uses fix-point iteration with these phases:
///
/// 1. **Fix-point iteration** - Repeat until convergence:
///    1. Ensures variables are registered in the lattice environment
///    2. Solves anti-symmetry constraints (where A <: B and B <: A implies A = B)
///    3. Sets up variable substitutions in the lattice environment
///    4. Collects constraints for each variable
///    5. Applies forward constraint pass to resolve lower bounds
///    6. Applies backward constraint pass to resolve upper bounds
///    7. Verifies all variables are constrained
///    8. Validates constraints and computes substitutions
/// 2. **Simplification** - Types are reduced to canonical forms
/// 3. **Validation** - Final constraint system verification
/// 4. **Diagnostic collection** - Gather all errors from the solving process
pub struct InferenceSolver<'env, 'heap> {
    /// Environment for performing lattice operations (meet, join, subtyping)
    lattice: LatticeEnvironment<'env, 'heap>,
    /// Environment for simplifying complex types
    simplify: SimplifyEnvironment<'env, 'heap>,

    /// Collected diagnostics for reporting type errors
    diagnostics: Diagnostics,
    persistent_diagnostics: Diagnostics,

    /// The set of constraints to be solved
    constraints: Vec<Constraint<'heap>>,
    /// The unification system for tracking variable equivalence
    unification: Unification,
}

impl<'env, 'heap> InferenceSolver<'env, 'heap> {
    /// Creates a new inference solver with the given environment and constraints.
    ///
    /// The solver is configured with a lattice environment that has simplification disabled
    /// during constraint solving to maintain correctness. A final simplification pass is
    /// performed after all constraints are resolved.
    ///
    /// # Arguments
    ///
    /// * `env` - The type environment containing type definitions and lattice operations
    /// * `unification` - Pre-existing unification table (typically empty for new solving)
    /// * `constraints` - The set of constraints to be solved
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
    ///
    /// Ensures that every variable referenced in constraints has a consistent
    /// internal representation before constraint processing begins. Also initializes
    /// the constraint graph with variable nodes.
    fn upsert_variables(&mut self, graph: &mut Graph) {
        for constraint in &self.constraints {
            for variable in constraint.variables() {
                self.unification.upsert_variable(variable.kind);
            }
        }

        graph.expansion(&mut self.unification);
    }

    /// Merges constraints from unified variables into a single constraint entry.
    ///
    /// When variables are unified during anti-symmetry resolution, their constraints
    /// must be merged to ensure consistency. Handles the merging logic by combining bound
    /// constraints and checking for conflicting equality constraints.
    ///
    /// # Arguments
    ///
    /// * `variables` - The constraint map to update with the merged entry
    /// * `root` - The canonical representative for the unified variables
    /// * `lhs` - Optional constraint entry from the first variable
    /// * `rhs` - Optional constraint entry from the second variable
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
    /// In a type lattice, if `A <: B` and `B <: A`, then `A ≡ B` by the anti-symmetry property.
    /// This method constructs a directed graph of subtyping and structural relationships, then uses
    /// Tarjan's strongly connected components algorithm to identify variables that must be unified.
    ///
    /// The graph includes:
    /// - **Ordering constraints**: Direct subtyping relationships between variables
    /// - **Structural edges**: Dependencies from field access and other structural constraints
    ///
    /// Variables in the same SCC are unified, and their constraints are merged to ensure
    /// consistency throughout the solving process.
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

    /// Creates an initial substitution map from equality constraints.
    ///
    /// Extracts variables that have equality constraints and creates a substitution map for use
    /// during lattice operations. The substitution enables the lattice environment to resolve
    /// variables to their known types during constraint processing.
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

    /// Organizes ordering constraints by the specified bound direction.
    ///
    /// Creates a lookup table that groups ordering constraints by either the lower or upper
    /// variable, which enables efficient retrieval of transitive constraints during the forward and
    /// backward passes.
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

    /// Resolves lower bounds through forward propagation in topological order.
    ///
    /// Processes variables from dependencies to dependents, ensuring that ower bounds are resolved
    /// before they are used by dependent variables. For each variable:
    ///
    /// 1. Collects transitive lower bounds from ordering constraints (if no equality constraint)
    /// 2. Computes the meet (greatest lower bound) of all collected lower bounds
    /// 3. Updates the substitution map for use by subsequent variables
    /// 4. Replaces the variable's lower bound list with the computed meet
    ///
    /// The topological ordering ensures that dependencies are resolved before dependents,
    /// preventing cycles and ensuring convergence.
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

    /// Resolves upper bounds through backward propagation in reverse topological order.
    ///
    /// Processes variables from dependents to dependencies, ensuring that upper bounds are resolved
    /// after their dependent variables. For each variable:
    ///
    /// 1. Collects transitive upper bounds from ordering constraints (if no equality constraint)
    /// 2. Computes the join (least upper bound) of all collected upper bounds
    /// 3. Updates the substitution map for use by subsequent variables
    /// 4. Replaces the variable's upper bound list with the computed join
    ///
    /// The reverse topological ordering ensures that dependent relationships are properly
    /// propagated through the constraint graph.
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

    /// Coordinates the complete constraint application process.
    ///
    /// Orchestrates the three-phase constraint resolution:
    /// 1. **Collection**: Groups constraints by their target variables
    /// 2. **Forward pass**: Resolves lower bounds in topological order
    /// 3. **Backward pass**: Resolves upper bounds in reverse topological order
    ///
    /// The two-pass approach ensures that constraint dependencies are resolved correctly, even with
    /// complex interdependencies between type variables.
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
    /// Processes the resolved constraints from the forward and backward passes,
    /// performing final validation and type determination. Verifies:
    ///
    /// - **Bound compatibility**: Lower bounds are subtypes of upper bounds
    /// - **Equality compatibility**: Equality constraints are compatible with bounds
    /// - **Constraint coverage**: All variables have sufficient constraints for inference
    ///
    /// Selects the most specific type for each variable based on the available constraints,
    /// preferring equality constraints, then lower bounds, then upper bounds.
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

    /// Verifies that all registered variables have been constrained.
    ///
    /// Checks that every variable in the unification system appears in the constraints map,
    /// indicating that it received at least one constraint during the solving process.
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

    /// Simplifies all computed type substitutions to their canonical forms.
    ///
    /// Applies the type simplification environment to reduce complex types to their most concise
    /// representation. Simplification improves both the readability of error messages and the
    /// efficiency of subsequent operations by eliminating redundant type structure.
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

    /// Attempts to resolve selection constraints (field access and subscript operations).
    ///
    /// Selection constraints represent operations like field access (`obj.field`) that depend on
    /// the structure of types. Tries to resolve each constraint by performing the corresponding
    /// lattice projection. Successfully resolved constraints generate new equality or ordering
    /// constraints.
    ///
    /// Constraints that cannot be resolved (due to pending type information) are added back to the
    /// constraint list for the next iteration.
    ///
    /// # Returns
    ///
    /// `true` if any constraints were successfully resolved, `false` if no progress
    /// was made (indicating a potential fix-point).
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

    /// Verifies that the constraint system has been solved to a valid fix-point.
    ///
    /// After fix-point iteration completes, only selection constraints should remain in the
    /// constraint list (as unresolvable constraints). All other constraint types should have
    /// been processed and removed during the iteration.
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

    /// Solves the constraint system and produces type substitutions.
    ///
    /// This is the main entry point for constraint solving. It implements a fix-point iteration
    /// algorithm that processes constraints until no new ones are generated, handling complex
    /// interdependencies between type variables.
    ///
    /// The algorithm proceeds in phases:
    ///
    /// 1. **Fix-point iteration** - Repeat until convergence:
    ///    1. Ensures variables are registered in the lattice environment
    ///    2. Solves anti-symmetry constraints (where A <: B and B <: A implies A = B)
    ///    3. Sets up variable substitutions in the lattice environment
    ///    4. Collects constraints for each variable
    ///    5. Applies forward constraint pass to resolve lower bounds
    ///    6. Applies backward constraint pass to resolve upper bounds
    ///    7. Verifies all variables are constrained
    ///    8. Validates constraints and computes substitutions
    /// 2. **Simplification** - Types are reduced to canonical forms
    /// 3. **Validation** - Final constraint system verification
    /// 4. **Diagnostic collection** - Gather all errors from the solving process
    ///
    /// The fix-point approach allows complex constraint dependencies to be resolved iteratively,
    /// with each pass potentially generating new constraints that are processed in subsequent
    /// iterations.
    ///
    /// # Returns
    ///
    /// A tuple containing the computed substitution mapping variables to their
    /// inferred types and any diagnostics encountered during solving.
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
