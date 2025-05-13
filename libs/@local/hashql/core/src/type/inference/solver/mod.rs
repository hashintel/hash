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
use crate::{
    collection::FastHashMap,
    r#type::{
        PartialType, TypeId,
        environment::{Diagnostics, Environment, LatticeEnvironment, SimplifyEnvironment},
        error::{
            bound_constraint_violation, conflicting_equality_constraints,
            incompatible_lower_equal_constraint, incompatible_upper_equal_constraint,
            unconstrained_type_variable, unconstrained_type_variable_floating,
        },
    },
};

/// The `Unification` struct manages variable unification during type inference.
///
/// It maintains a disjoint set data structure (union-find) to track which variables
/// have been unified together, allowing the solver to efficiently determine when
/// multiple variables represent the same type.
///
/// This struct is responsible for:
///
/// - Tracking all type variables in the system
/// - Maintaining a mapping between variable kinds and their internal IDs
/// - Unifying variables when they are determined to be equivalent
/// - Finding the canonical representative for each variable
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

    /// Inserts a variable into the unification system if it doesn't exist yet,
    /// or returns the existing ID if the variable is already present.
    pub(crate) fn upsert_variable(&mut self, variable: VariableKind) -> VariableId {
        *self.lookup.entry(variable).or_insert_with_key(|&key| {
            let id = self.table.new_key(());
            debug_assert_eq!(id.into_usize(), self.variables.len());

            self.variables.push(key);
            id
        })
    }

    /// Unifies two variables, marking them as representing the same type.
    ///
    /// After unification, both variables will have the same representative in the
    /// union-find structure, and constraints applied to one will affect the other.
    pub(crate) fn unify(&mut self, lhs: VariableKind, rhs: VariableKind) {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table
            .unify_var_var(lhs, rhs)
            .unwrap_or_else(|_: NoError| unreachable!());
    }

    /// Checks if two variables have been unified (are in the same equivalence class).
    pub(crate) fn is_unioned(&mut self, lhs: VariableKind, rhs: VariableKind) -> bool {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table.unioned(lhs, rhs)
    }

    /// Gets the ID of the canonical representative for a variable.
    ///
    /// This is used to find the "root" variable in the equivalence class,
    /// which is important when applying constraints to ensure they affect
    /// all unified variables consistently.
    fn root_id(&mut self, variable: VariableKind) -> VariableId {
        let id = self.upsert_variable(variable);

        self.table.find(id)
    }

    /// Gets the canonical `VariableKind` for a variable, useful for
    /// constraint application and error reporting.
    fn root(&mut self, variable: VariableKind) -> VariableKind {
        let id = self.root_id(variable);

        self.variables[id.into_usize()]
    }

    /// Creates a lookup table that maps each variable to its canonical representative.
    ///
    /// This is used after unification to efficiently determine the final variable
    /// mappings for substitution.
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

/// Represents the direction of a type bound constraint.
///
/// Type constraints in the inference system are often directional, establishing
/// either an upper bound (subtype relationship) or a lower bound (supertype relationship).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Bound {
    /// An upper bound constraint where the variable must be a subtype of the bound.
    /// For example, in `X <: T`, T is an upper bound on X.
    Upper,
    /// A lower bound constraint where the variable must be a supertype of the bound.
    /// For example, in `T <: X`, T is a lower bound on X.
    Lower,
}

/// Represents a resolved variable with its tracking information.
///
/// This struct maintains both the original variable (for error reporting) and
/// its resolved representation after unification (for constraint solving).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct ResolvedVariable {
    /// The original variable from the source code (used for error reporting)
    origin: Variable,

    /// The internal ID for the variable in the unification system
    id: VariableId,
    /// The canonical kind of the variable after unification
    kind: VariableKind,
}

/// Represents an ordering constraint between two variables.
///
/// This tracks a subtyping relationship where `lower <: upper`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct VariableOrdering {
    /// The variable that must be a subtype
    lower: ResolvedVariable,
    /// The variable that must be a supertype
    upper: ResolvedVariable,
}

/// Represents the constraints applied to a single type variable.
///
/// This aggregates all the equality, lower bound, and upper bound constraints
/// for efficient processing during constraint solving.
#[derive(Debug, PartialEq, Eq, Default)]
struct VariableConstraint<L, R> {
    /// The exact type this variable must equal, if such a constraint exists
    equal: Option<TypeId>,
    /// Lower bound constraints (variable must be a supertype of these types)
    lower: L,
    /// Upper bound constraints (variable must be a subtype of these types)
    upper: R,
}

/// Constraint with unprocessed collections of lower and upper bounds.
///
/// Used during the initial phase of constraint collection before bounds are resolved.
type UnresolvedVariableConstraint = VariableConstraint<Vec<TypeId>, Vec<TypeId>>;

/// Constraint with a resolved lower bound but unresolved upper bounds.
///
/// Used during the forward pass of constraint resolution when lower bounds
/// have been processed but upper bounds are still being collected.
type LowerResolvedVariableConstraint = VariableConstraint<Option<TypeId>, Vec<TypeId>>;

/// Fully resolved constraint with at most one lower and one upper bound.
///
/// The final form of constraints after both forward and backward passes,
/// ready for final solving and validation.
type ResolvedVariableConstraint = VariableConstraint<Option<TypeId>, Option<TypeId>>;

/// The main type inference solver that resolves constraints to determine concrete types.
///
/// This solver implements a multi-phase constraint solving algorithm that handles
/// complex type relationships including subtyping, equality constraints, and structural
/// dependencies. It works with a lattice-based type system where types form a partial
/// order.
///
/// The solver operates in several phases:
///
/// 1. Anti-symmetry resolution - Identify variables that should be equal
/// 2. Constraint collection - Aggregate all constraints by variable
/// 3. Forward pass - Resolve lower bounds in topological order
/// 4. Backward pass - Resolve upper bounds in reverse topological order
/// 5. Final resolution - Validate constraints and compute substitutions
/// 6. Simplification - Reduce types to their simplest form
pub struct InferenceSolver<'env, 'heap> {
    /// Environment for performing lattice operations (meet, join, subtyping)
    lattice: LatticeEnvironment<'env, 'heap>,
    /// Environment for simplifying complex types
    simplify: SimplifyEnvironment<'env, 'heap>,

    /// Collected diagnostics for reporting type errors
    diagnostics: Diagnostics,

    /// The set of constraints to be solved
    constraints: Vec<Constraint>,
    /// The unification system for tracking variable equivalence
    unification: Unification,
}

impl<'env, 'heap> InferenceSolver<'env, 'heap> {
    /// Creates a new inference solver with the given environment, unification table, and
    /// constraints.
    ///
    /// # Arguments
    ///
    /// * `env` - The type environment for accessing type definitions and operations
    /// * `unification` - Pre-existing unification table (can be empty)
    /// * `constraints` - The set of constraints to be solved
    ///
    /// # Implementation Note
    ///
    /// We configure the lattice environment to skip simplification during constraint solving
    /// for correctness reasons. When solving the solver will do one last simplification pass
    /// to ensure all types are in their simplest form.
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

    /// Registers all variables mentioned in constraints into the unification system.
    ///
    /// This ensures that every variable has a consistent representation in the solver
    /// before we start processing constraints.
    fn upsert_variables(&mut self) {
        for constraint in &self.constraints {
            for variable in constraint.variables() {
                self.unification.upsert_variable(variable.kind);
            }
        }
    }

    /// Identifies and unifies variables that should be equal due to anti-symmetry.
    ///
    /// In a type lattice, if `A <: B` and `B <: A`, then `A = B` (anti-symmetry property).
    /// This method builds a directed graph of subtyping relationships and uses Tarjan's
    /// algorithm to find strongly connected components (SCCs). Variables in the same SCC
    /// must be equal due to circular subtyping relationships.
    ///
    /// Additionally, structural edges (from constraints like `_1 <: (name: _2)` and `_2 <: 1`)
    /// are included in this analysis, as they can also create equality relationships.
    fn solve_anti_symmetry(&mut self) -> Graph {
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

        // Run Tarjan's SCC algorithm to find strongly connected components
        let tarjan = Tarjan::new(&graph);

        // For each strongly connected component, unify all variables in the component
        // since they must be equal due to anti-symmetry of the subtyping relation
        for scc in tarjan.compute() {
            for [lhs, rhs] in scc.iter().map_windows(|values: &[_; 2]| *values) {
                let lhs = self.unification.variables[lhs as usize];
                let rhs = self.unification.variables[rhs as usize];

                self.unification.unify(lhs, rhs);
            }
        }

        graph.condense(&mut self.unification);
        graph
    }

    /// Collects and organizes all constraints by variable.
    ///
    /// This method processes each constraint and groups them by the canonical
    /// representative of the variable they constrain. It handles different types of
    /// constraints (upper bounds, lower bounds, equality) and aggregates them into
    /// a per-variable constraint structure for efficient processing.
    ///
    /// # Returns
    ///
    /// A map from variable kinds to their associated constraints, with each entry
    /// containing both the original variable (for error reporting) and the unresolved
    /// constraint information.
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
                        Some(existing) => self.diagnostics.push(conflicting_equality_constraints(
                            &self.lattice,
                            variable,
                            self.lattice.r#type(existing),
                            self.lattice.r#type(r#type),
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

    /// Prepares a substitution map from known equality constraints.
    ///
    /// This method extracts equality constraints from the variable constraints map
    /// and constructs an initial substitution map. These equalities will be
    /// verified for consistency in a later phase.
    ///
    /// # Returns
    ///
    /// A substitution map that maps variables to their equal types
    fn apply_constraints_prepare_substitution<L, H>(
        &mut self,
        graph: &Graph,
        variables: &FastHashMap<VariableKind, (Variable, VariableConstraint<L, H>)>,
    ) -> Substitution {
        let mut substitution = Substitution::new(
            self.unification.lookup(),
            FastHashMap::with_capacity_and_hasher(
                variables.len(),
                foldhash::fast::RandomState::default(),
            ),
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

    /// Prepares a map of ordering relationships by variable.
    ///
    /// This method organizes ordering constraints (subtyping relationships) by
    /// the specified bound direction (upper or lower).
    ///
    /// # Returns
    ///
    /// A map from variable IDs to the list of ordering constraints where that
    /// variable appears in the specified position.
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

    /// Performs the forward pass of constraint resolution.
    ///
    /// This method processes variables in topological order (from dependencies to
    /// dependents) to resolve lower bounds. For each variable, it:
    /// 1. Collects all direct lower bounds
    /// 2. Adds transitive lower bounds from ordering constraints
    /// 3. Computes the meet (greatest lower bound) of all lower bounds
    /// 4. Updates the substitution map with the resolved lower bound
    ///
    /// # Returns
    ///
    /// A map of variables to their constraints with resolved lower bounds
    fn apply_constraints_forwards(
        &mut self,
        graph: &Graph,
        mut variables: FastHashMap<VariableKind, (Variable, UnresolvedVariableConstraint)>,
    ) -> FastHashMap<VariableKind, (Variable, LowerResolvedVariableConstraint)> {
        let mut constraints = FastHashMap::with_capacity_and_hasher(
            variables.len(),
            foldhash::fast::RandomState::default(),
        );

        // Create a substitution from known equality constraints
        let substitution = self.apply_constraints_prepare_substitution(graph, &variables);
        self.lattice.set_substitution(substitution);

        // We're currently looking through `lower`, therefore, look for any variables for which
        // `a <: b`, where `b` is the current node.
        let lookup = self.apply_constraints_prepare_constraints(Bound::Upper);

        // Does a forwards pass over the graph to apply any lower constraints in order
        // Process nodes in topological order to ensure dependencies are resolved first
        let topo = topological_sort(graph).expect("expected dag after anti-symmetry run");

        for index in topo {
            let id = graph.node(index);
            let kind = self.unification.variables[id.into_usize()];

            let Some((variable, mut variable_constraint)) = variables.remove(&kind) else {
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
            let VariableConstraint {
                equal,
                lower,
                upper,
            } = variable_constraint;

            // Compute the meet (greatest lower bound) of all lower bounds
            let lower = lower
                .into_iter()
                .reduce(|lhs, rhs| self.lattice.meet(lhs, rhs));

            // If there's no equality constraint but we have a lower bound,
            // add the lower bound to the substitution map for future resolution
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

        // Clear substitution to avoid unintended effects in later operations
        self.lattice.clear_substitution();

        constraints
    }

    /// Performs the backward pass of constraint resolution.
    ///
    /// This method processes variables in reverse topological order (from
    /// dependents to dependencies) to resolve upper bounds. For each variable, it:
    ///
    /// 1. Collects all direct upper bounds
    /// 2. Adds transitive upper bounds from ordering constraints
    /// 3. Computes the join (least upper bound) of all upper bounds
    /// 4. Updates the substitution map with the resolved upper bound
    ///
    /// # Returns
    ///
    /// A map of variables to their fully resolved constraints
    fn apply_constraints_backwards(
        &mut self,
        graph: &Graph,
        mut variables: FastHashMap<VariableKind, (Variable, LowerResolvedVariableConstraint)>,
    ) -> FastHashMap<VariableKind, (Variable, ResolvedVariableConstraint)> {
        let mut constraints = FastHashMap::with_capacity_and_hasher(
            variables.len(),
            foldhash::fast::RandomState::default(),
        );

        // Create a substitution from known equality and lower bound constraints
        let substitution = self.apply_constraints_prepare_substitution(graph, &variables);
        self.lattice.set_substitution(substitution);

        // We're currently looking through `upper`, therefore, look for any variables for which
        // `a <: b`, where `a` is the current node.
        let lookup = self.apply_constraints_prepare_constraints(Bound::Lower);

        // We do a backwards pass over the graph to apply any upper constraints in order
        // Process nodes in reverse topological order for upper bound resolution
        let topo = topological_sort(graph).expect("expected dag after anti-symmetry run");

        for index in topo.into_iter().rev() {
            let id = graph.node(index);
            let kind = self.unification.variables[id.into_usize()];

            let Some((variable, mut variable_constraint)) = variables.remove(&kind) else {
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

            // Now that we have all bounds, unify them
            let VariableConstraint {
                equal,
                lower,
                upper,
            } = variable_constraint;

            // Compute the join (least upper bound) of all upper bounds
            let upper = upper
                .into_iter()
                .reduce(|lhs, rhs| self.lattice.join(lhs, rhs));

            // If there's no equality constraint but we have an upper bound,
            // add the upper bound to the substitution map for future resolution
            if equal.is_none()
                && let Some(upper) = upper
            {
                // Insert into substitution map, so that future resolvers can use it
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

        // Clear substitution to avoid unintended effects in later operations
        self.lattice.clear_substitution();

        constraints
    }

    /// Coordinates the entire constraint resolution process.
    ///
    /// This method builds the constraint graph, performs the forward and backward
    /// passes, and returns the fully resolved constraints. The resolution process works
    /// in multiple phases:
    ///
    /// 1. Collect constraints for each variable
    /// 2. Build a directed graph of variable relationships
    /// 3. Resolve lower bounds via a forward pass
    /// 4. Resolve upper bounds via a backward pass
    ///
    /// This approach ensures that constraints are propagated correctly through the
    /// dependency graph, even with complex type relationships.
    ///
    /// # Returns
    ///
    /// A map of variables to their fully resolved constraints
    fn apply_constraints(
        &mut self,
    ) -> FastHashMap<VariableKind, (Variable, ResolvedVariableConstraint)> {
        // First collect all constraints by variable
        let constraints = self.collect_constraints();

        // Build the constraint graph representing variable dependencies
        let mut graph = Graph::new(&mut self.unification);

        // Build the graph over the constraints
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

        // Perform the forward pass to resolve lower bounds
        let constraints = self.apply_constraints_forwards(&graph, constraints);

        // Perform the backward pass to resolve upper bounds
        self.apply_constraints_backwards(&graph, constraints)
    }

    /// Validates all constraints and computes final type substitutions.
    ///
    /// This method takes the fully resolved constraints from the forward and
    /// backward passes and performs final verification. It ensures that:
    ///
    /// 1. Lower and upper bounds are compatible (lower <: upper)
    /// 2. Equality constraints are compatible with bounds
    /// 3. All variables have at least one constraint
    ///
    /// # Returns
    /// A map of variables to their inferred types
    fn solve_constraints(
        &mut self,
        constraints: FastHashMap<VariableKind, (Variable, ResolvedVariableConstraint)>,
    ) -> FastHashMap<VariableKind, TypeId> {
        let mut substitutions = FastHashMap::default();

        // Prepare a substitution map using the existing equality constraints
        // This allows us to use these equalities when verifying other constraints
        let mut substitution = Substitution::new(
            self.unification.lookup(),
            FastHashMap::with_capacity_and_hasher(
                constraints.len(),
                foldhash::fast::RandomState::default(),
            ),
        );

        for (&kind, (_, constraint)) in &constraints {
            if let Some(constraint) = constraint.equal {
                substitution.insert(kind, constraint);
            }
        }

        self.lattice.set_substitution(substitution);

        // Because we substitute during the forward passes, we do not need to verify the constraints
        // again *or* do it in a specific order. The substitutions have already been applied for the
        // lower and upper bounds respectively.

        for (kind, (variable, constraint)) in constraints {
            // First, verify that lower and upper bounds are compatible
            // (i.e., lower <: upper)
            if let VariableConstraint {
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
                VariableConstraint {
                    equal: None,
                    lower: None,
                    upper: None,
                } => {
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
                VariableConstraint {
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

        substitutions
    }

    /// Verifies that all variables in the system have been constrained.
    ///
    /// This method checks that every variable has been assigned a concrete type
    /// through the constraint solving process. If any variable remains unconstrained,
    /// a diagnostic error is generated.
    ///
    /// Any error that is encountered during this process is deemed a compiler bug, as we have no
    /// span to associate with the error. This should usually never happen, as step 1 ensures every
    /// variable is registered.
    fn verify_constrained<L, U>(
        &mut self,
        lookup: &VariableLookup,
        constraints: &FastHashMap<VariableKind, (Variable, VariableConstraint<L, U>)>,
    ) {
        for &variable in &self.unification.variables {
            let root = lookup[variable];
            if !constraints.contains_key(&root) {
                self.diagnostics
                    .push(unconstrained_type_variable_floating(&self.lattice));
            }
        }
    }

    /// Simplifies the computed type substitutions.
    ///
    /// This method applies type simplification rules to the computed types,
    /// reducing them to their most concise form. This is helpful for both
    /// readability of error messages and efficiency of subsequent type checking.
    ///
    /// # Returns
    ///
    /// A map of variables to their simplified types
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

    /// Solves type inference constraints and produces a type substitution.
    ///
    /// This is the main entry point for the inference solver. It coordinates the
    /// entire constraint solving process:
    ///
    /// 1. Registers all variables in the unification system
    /// 2. Solves anti-symmetry constraints to identify variables that must be equal
    /// 3. Sets up variable substitutions in the lattice environment
    /// 4. Applies constraints through forward and backward passes
    /// 5. Verifies that all variables are constrained
    /// 6. Validates constraints and computes substitutions
    /// 7. Simplifies the final substitutions for better readability
    /// 8. Collects any diagnostics generated during solving
    ///
    /// # Returns
    ///
    /// A tuple containing:
    /// - The computed substitution mapping variables to their inferred types
    /// - Diagnostics reporting any errors encountered during solving
    #[must_use]
    pub fn solve(mut self) -> (Substitution, Diagnostics) {
        // Step 1: Register all variables with the unification system
        self.upsert_variables();

        // Step 2: Solve anti-symmetry constraints (A <: B and B <: A implies A = B)
        self.solve_anti_symmetry();

        let lookup = self.unification.lookup();
        // Set the variable substitutions in the lattice, this makes sure that `equal` constraints
        // are more lax when comparing equal values.
        self.lattice.set_variables(lookup.clone());

        // Step 3 & 4: Apply constraints through forward and backward passes
        let constraints = self.apply_constraints();

        // Step 5: Verify that all variables have been constrained
        self.verify_constrained(&lookup, &constraints);

        // Step 6: Validate constraints and determine final types
        let mut substitution = self.solve_constraints(constraints);

        // Step 7: Simplify the final substitutions
        self.simplify_substitutions(lookup.clone(), &mut substitution);
        let substitution = Substitution::new(lookup, substitution);

        // Step 8: Collect all diagnostics from the solving process
        let mut diagnostics = self.diagnostics;
        diagnostics.merge(self.lattice.take_diagnostics());
        if let Some(simplify) = self.simplify.take_diagnostics() {
            diagnostics.merge(simplify);
        }

        (substitution, diagnostics)
    }
}
