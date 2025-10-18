//! Graph hoisting optimization for HIR expressions.
//!
//! This module implements an optimization that moves (`hoists`) let bindings from within
//! graph read operations and closures to outer scopes when safe to do so. Graph reads
//! act as iterators, akin to `for` loops, so moving out loop-invariant expressions
//! reduces redundant computation.
//!
//! # Example
//!
//! ```text
//! // Before hoisting:
//! graph.read(|entity| {
//!   let expensive = heavy_computation();  // Loop invariant - computed every iteration
//!   let dependent = expensive + entity.value;
//!   dependent
//! })
//!
//! // After hoisting:
//! let expensive = heavy_computation();    // Hoisted outside - computed once
//! graph.read(|entity| {
//!   let dependent = expensive + entity.value;
//!   dependent
//! })
//! ```
//!
//! # Algorithm
//!
//! The hoisting process preserves HIR(ANF) invariants by:
//!
//! 1. **Tracking scope boundaries**: Identifying when we're inside graph reads and closures
//! 2. **Dependency analysis**: For each binding, determining which variables it depends on
//! 3. **Safety checking**: Only hoisting bindings that don't depend on closure parameters
//! 4. **Dependency propagation**: Using an "infection" model where dependent bindings mark their
//!    outputs as scope-dependent, preventing further hoisting chains
//!
//! # Design Decisions
//!
//! **Let binding boundaries**: HIR(ANF) collapses lets where possible, making them natural
//! collection points for hoisting decisions without complex boundary detection. Graph reads and
//! closures are also (unlike traditional ANF) atoms, therefore can only happen inside of let
//! bindings.
//!
//! **Graph-nested scope restriction**: We only hoist inside closures nested within graph
//! operations, where the optimization provides maximum benefit while limiting analysis complexity.
//!
//! **Dependency propagation over union-find**: Instead of traditional union-find structures,
//! we use "dependency infection" where any binding depending on closure parameters marks
//! its output variable as scope-dependent. This preserves more hoisting opportunities than
//! union-find, which would aggressively union any variables referenced together.

use core::{convert::Infallible, mem};

use hashql_core::{
    collections::pool::{MixedBitSetPool, MixedBitSetRecycler, VecPool},
    id::bit_vec::{BitRelations as _, MixedBitSet},
    intern::Interned,
};

use crate::{
    context::HirContext,
    fold::{self, Fold},
    intern::Interner,
    lower::dataflow::VariableDependencies,
    node::{
        Node,
        closure::Closure,
        graph::Graph,
        r#let::{Binding, VarId},
    },
    visit::Visitor as _,
};

/// Configuration for graph hoisting optimization.
///
/// Controls memory pool sizes for efficient allocation during the hoisting process.
/// The pools are used to avoid repeated allocations when processing binding collections
/// and variable dependency sets.
#[derive(Debug, Copy, Clone)]
pub struct GraphHoistingConfig {
    /// Initial capacity for the bitset recycler pool.
    ///
    /// This controls how many bitsets can be reused for variable dependency tracking.
    /// Higher values reduce allocation overhead in complex expressions with many variables.
    pub bitset_recycler_capacity: usize,

    /// Initial capacity for the binding recycler pool.
    ///
    /// This controls how many binding vectors can be reused during scope manipulation.
    /// Higher values are beneficial when processing deeply nested expressions.
    pub binding_recycler_capacity: usize,
}

impl Default for GraphHoistingConfig {
    fn default() -> Self {
        Self {
            bitset_recycler_capacity: 8,
            binding_recycler_capacity: 4,
        }
    }
}

/// Graph hoisting transformation state.
///
/// Manages the process of moving let bindings from inner scopes (within graph operations
/// and closures) to outer scopes when the bindings don't depend on inner scope variables.
///
/// This optimization preserves HIR(ANF) invariants while reducing redundant computation
/// by evaluating expressions at the earliest safe point.
pub struct GraphHoisting<'ctx, 'env, 'heap> {
    /// Reference to the HIR context for accessing interners and counters.
    context: &'ctx HirContext<'env, 'heap>,

    /// Current scope's accumulated bindings.
    ///
    /// Bindings are collected here during traversal and either hoisted to outer
    /// scopes or kept in the current scope based on dependency analysis.
    scope: Vec<Binding<'heap>>,

    /// Flag indicating if we're currently nested inside a graph operation.
    ///
    /// This determines whether hoisting is active - we only hoist when inside
    /// graph operations to avoid premature evaluation.
    nested_inside_graph: bool,

    /// Variables that define the current closure scope.
    ///
    /// When `Some`, contains the set of parameter variables for the current closure.
    /// Bindings that depend on these variables cannot be hoisted. When `None`,
    /// we're not in a hoistable context.
    scope_sources: Option<MixedBitSet<VarId>>,

    /// Pool for recycling binding vectors to reduce allocations.
    binding_pool: VecPool<Binding<'heap>>,

    /// Pool for recycling bitsets used in dependency analysis.
    bitset_pool: MixedBitSetPool<VarId>,
}

impl<'ctx, 'env, 'heap> GraphHoisting<'ctx, 'env, 'heap> {
    /// Creates a new graph hoisting transformer.
    ///
    /// Initializes the transformer with the given context and configuration,
    /// setting up memory pools for efficient processing.
    #[must_use]
    pub fn new(context: &'ctx HirContext<'env, 'heap>, config: GraphHoistingConfig) -> Self {
        Self {
            context,
            scope: Vec::new(),
            nested_inside_graph: false,
            scope_sources: None,
            binding_pool: VecPool::new(config.binding_recycler_capacity),
            bitset_pool: MixedBitSetPool::with_recycler(
                config.bitset_recycler_capacity,
                MixedBitSetRecycler {
                    domain_size: context.counter.var.size(),
                },
            ),
        }
    }

    /// Runs the graph hoisting optimization on the given node.
    ///
    /// Performs a complete traversal of the node tree, hoisting let bindings
    /// where safe to do so. After completion, all internal state is cleaned up
    /// and the optimized node is returned.
    ///
    /// # Panics
    ///
    /// Panics in debug builds if the internal state isn't properly cleaned up
    /// after traversal, indicating a bug in the implementation.
    #[must_use]
    pub fn run(mut self, node: Node<'heap>) -> Node<'heap> {
        let Ok(node) = self.fold_node(node);

        debug_assert!(
            self.scope.is_empty(),
            "The scope should have been emptied when traversing the tree"
        );
        debug_assert!(
            self.scope_sources.is_none(),
            "The scope sources should have been restored after traversing the tree"
        );

        node
    }
}

impl<'heap> Fold<'heap> for GraphHoisting<'_, '_, 'heap> {
    type NestedFilter = crate::fold::nested::Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    /// Processes a collection of let bindings, potentially hoisting some to outer scopes.
    ///
    /// This is the core of the hoisting algorithm. The method:
    ///
    /// 1. **Scope Management**: Replaces the current scope with a fresh collection
    /// 2. **Binding Processing**: Walks each binding and adds it to the current scope
    /// 3. **Dependency Analysis**: Analyzes which bindings depend on inner scope variables
    /// 4. **Hoisting Decision**: Moves independent bindings to the outer scope
    /// 5. **Infection Propagation**: Marks dependent bindings to prevent their hoisting
    ///
    /// # Algorithm Details
    ///
    /// The core insight is that let binding sites form natural boundaries in HIR(ANF).
    /// Since lets are collapsed where possible during ANF conversion, each let represents
    /// a meaningful boundary where we can collect and redistribute bindings.
    ///
    /// When inside a closure (indicated by `scope_sources.is_some()`), we can hoist
    /// bindings that don't depend on the closure's parameters. The dependency analysis
    /// uses dependency propagation where any binding depending on scope variables marks
    /// its output variable as scope-dependent, preventing further hoisting chains.
    ///
    /// # Safety
    ///
    /// Hoisting preserves evaluation order and correctness because:
    /// - Only bindings without scope dependencies are moved
    /// - Moved bindings are placed in the immediately outer scope
    /// - The HIR(ANF) structure ensures proper evaluation sequencing
    fn fold_bindings(
        &mut self,
        bindings: Interned<'heap, [Binding<'heap>]>,
    ) -> Self::Output<Interned<'heap, [Binding<'heap>]>> {
        // Replace current scope with fresh collection, using binding count as size hint
        // since we typically don't hoist many bindings
        let mut upper_scope = mem::replace(
            &mut self.scope,
            self.binding_pool.acquire_with(bindings.len()),
        );

        // Process each binding in order to maintain evaluation sequence
        // Bindings are added *after* walking to ensure proper computation order
        for &binding in bindings {
            let Ok(binding) = fold::walk_binding(self, binding);
            self.scope.push(binding);
        }

        // Check if we can hoist any bindings to the outer scope
        let Some(mut scope_sources) = self.scope_sources.take() else {
            // Not in a hoistable context - just collect bindings and return
            let bindings = mem::replace(&mut self.scope, upper_scope);
            let output = self.context.interner.bindings.intern_slice(&bindings);
            self.binding_pool.release(bindings);

            return Ok(output);
        };

        // We're inside a closure - analyze dependencies and hoist safe bindings
        // Dependency propagation: any binding depending on scope variables marks
        // its output variable as scope-dependent, preventing further hoisting chains
        self.scope.retain(|binding| {
            // Analyze which variables this binding depends on
            let mut variables = VariableDependencies::from_set(self.bitset_pool.acquire());
            variables.visit_node(&binding.value);
            let mut variables = variables.finish();

            // Check intersection with closure parameters
            variables.intersect(&scope_sources);

            let should_keep = if variables.is_empty() {
                // No dependencies on closure parameters - safe to hoist
                upper_scope.push(*binding);
                false
            } else {
                // Depends on closure scope - keep in current scope and mark output as dependent
                scope_sources.insert(binding.binder.id);
                true
            };

            self.bitset_pool.release(variables);
            should_keep
        });

        self.bitset_pool.release(scope_sources);

        // Restore scope hierarchy and return processed bindings
        // Note: Empty binding collections are fine and will be cleaned up in subsequent passes
        let bindings = mem::replace(&mut self.scope, upper_scope);
        let interned = self.context.interner.bindings.intern_slice(&bindings);
        self.binding_pool.release(bindings);

        Ok(interned)
    }

    /// Processes graph operations, marking the entry into a hoistable context.
    ///
    /// When entering a graph operation, we set the `nested_inside_graph` flag to enable
    /// hoisting in any nested closures. This is where the optimization becomes beneficial,
    /// as graph operations often contain closures with redundant computations.
    fn fold_graph(&mut self, graph: Graph<'heap>) -> Self::Output<Graph<'heap>> {
        let previous = mem::replace(&mut self.nested_inside_graph, true);
        let Ok(graph) = fold::walk_graph(self, graph);
        self.nested_inside_graph = previous;
        Ok(graph)
    }

    /// Processes closure definitions, potentially enabling hoisting for nested expressions.
    ///
    /// The behavior depends on whether we're nested inside a graph operation:
    ///
    /// # Outside Graph Context
    ///
    /// When not nested inside a graph, we temporarily disable hoisting to prevent
    /// premature evaluation. The closure parameters aren't tracked as hoistable scope
    /// sources since we don't want let bindings trying to promote anything to outer
    /// scopes inappropriately.
    ///
    /// # Inside Graph Context
    ///
    /// When nested inside a graph operation, we enable hoisting by:
    /// 1. Creating a parameter set containing all closure parameter variables
    /// 2. Setting this as the current scope source for dependency checking
    /// 3. Processing the closure body with hoisting enabled
    /// 4. Restoring the previous scope state
    ///
    /// # Parameter Tracking
    ///
    /// The closure parameters define the "scope boundary" - any binding depending
    /// on these parameters cannot be hoisted outside the closure. This ensures
    /// correctness while allowing maximum optimization opportunities.
    fn fold_closure(&mut self, closure: Closure<'heap>) -> Self::Output<Closure<'heap>> {
        let nested_inside_graph = mem::replace(&mut self.nested_inside_graph, false);

        if !nested_inside_graph {
            // Outside graph context - disable hoisting temporarily
            // This prevents inappropriate promotion of bindings to outer scopes
            let prev_scope_sources = self.scope_sources.take();
            let result = fold::walk_closure(self, closure);

            self.scope_sources = prev_scope_sources;
            self.nested_inside_graph = nested_inside_graph;

            return result;
        }

        // Inside graph context - enable hoisting with parameter tracking
        let mut params = self.bitset_pool.acquire();
        for param in closure.signature.params {
            params.insert(param.name.id);
        }

        // Set closure parameters as scope boundary for dependency analysis
        let prev_scope_sources = self.scope_sources.replace(params);
        let Ok(closure) = fold::walk_closure(self, closure);

        // Restore previous scope state (the returned value is used to signal
        // to the closure body that hoisting is officially enabled)
        self.scope_sources = prev_scope_sources;
        self.nested_inside_graph = nested_inside_graph;
        Ok(closure)
    }
}
