//! Administrative reduction pass for HashQL MIR.
//!
//! This pass performs a form of partial evaluation by inlining "trivial" function bodies at their
//! call sites. The term "administrative" comes from the lambda calculus literature, where
//! administrative redexes are β-redexes introduced by program transformations (like CPS
//! conversion) rather than by the programmer.
//!
//! # Reduction Targets
//!
//! The pass identifies and reduces two kinds of functions:
//!
//! - **Trivial thunks**: Single-basic-block functions with only trivial statements (`Load`,
//!   `Aggregate`, `Nop`) that immediately return a value. These are fully inlined.
//!
//! - **Forwarding closures**: Single-basic-block functions where a trivial prelude leads to a
//!   single call whose result is returned. The wrapper is eliminated, exposing the inner call.
//!
//! # Algorithm
//!
//! The pass operates in a single traversal using call-graph postorder (callees before callers):
//!
//! 1. Build the call graph and classify all bodies for reducibility
//! 2. Process bodies in postorder — when visiting a caller, all its callees have already been
//!    processed and potentially reclassified
//! 3. For each body, inline any calls to reducible functions
//! 4. After transforming a body, reclassify it — if it became reducible, subsequent callers will
//!    see the updated classification
//!
//! This achieves global maximality in a single pass: the monotonically growing reducibility set
//! combined with postorder traversal ensures no reduction opportunities are missed (up to SCCs).
//!
//! # Correctness Invariants
//!
//! The pass maintains several invariants that ensure soundness:
//!
//! - **Callees are never mutated**: When inlining, we only read from callee bodies and mutate the
//!   current caller. This ensures postorder gives us stable callee definitions.
//!
//! - **Local offsets are correctly applied**: When splicing callee statements into the caller, only
//!   callee-local indices are offset; caller locals in argument bindings are preserved.
//!
//! - **Self-recursion is blocked**: Direct self-calls are skipped to prevent infinite inlining.
//!
//! # Limitations
//!
//! - Mutual recursion between reducible functions may not be fully reduced in one pass
//! - Functions with control flow (multiple basic blocks) are not candidates for reduction

#[cfg(test)]
mod tests;

mod disjoint;
mod kind;
mod offset;
mod visitor;

use core::{alloc::Allocator, cmp, mem};

use hashql_core::{
    graph::{Successors as _, Traverse as _},
    heap::BumpAllocator,
};

use self::{
    disjoint::DisjointIdSlice,
    kind::ReductionKind,
    visitor::{AdministrativeReductionVisitor, BodyHeader, Callee, State},
};
use crate::{
    body::{Body, basic_block::BasicBlockId, local::LocalVec},
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        Changed, GlobalTransformPass, GlobalTransformState, TransformPass, analysis::CallGraph,
        transform::copy_propagation::propagate_block_params,
    },
    visit::VisitorMut as _,
};

/// Tracks which function bodies are eligible for administrative reduction.
///
/// This structure maintains both a dense mapping from `DefId` to `ReductionKind` (for looking up
/// *how* to reduce a function). The set grows monotonically during the pass as transformed bodies
/// become newly reducible.
struct Reducable<A: Allocator> {
    inner: DefIdVec<Option<ReductionKind>, A>,
}

impl<A: Allocator> Reducable<A> {
    fn new(bodies: &DefIdSlice<Body<'_>>, alloc: A) -> Self {
        let mut this = Self {
            inner: DefIdVec::with_capacity_in(bodies.len(), alloc),
        };

        for body in bodies {
            this.insert(body);
        }

        this
    }

    fn insert(&mut self, body: &Body<'_>) -> bool {
        let Some(kind) = ReductionKind::of(body) else {
            return false;
        };

        let previous = self.inner.insert(body.id, kind);

        previous.is_none()
    }

    fn get(&self, id: DefId) -> Option<ReductionKind> {
        self.inner.lookup(id).copied()
    }

    fn contains(&self, id: DefId) -> bool {
        self.inner.contains(id)
    }

    fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

/// Pre-allocated scratch space reused across per-body transformations.
///
/// Allocating these vectors once and reusing them avoids repeated allocations when processing
/// many bodies. The capacities are sized to the maximum across all bodies in the program.
struct ScratchMemory<'heap, A: Allocator> {
    basic_block_reverse_postorder: Vec<BasicBlockId, A>,
    callees: LocalVec<Option<Callee<'heap>>, A>,
    args: Vec<Option<Callee<'heap>>, A>,
}

impl<'heap, A: Allocator> ScratchMemory<'heap, A> {
    fn new(bodies: &DefIdSlice<Body<'heap>>, alloc: A) -> Self
    where
        A: Clone,
    {
        let mut max_basic_block_len = 0;
        let mut max_local_decl_len = 0;
        let mut max_arg_len = 0;

        for body in bodies {
            max_basic_block_len = cmp::max(max_basic_block_len, body.basic_blocks.len());
            max_local_decl_len = cmp::max(max_local_decl_len, body.local_decls.len());

            // We assume that at a maximum each basic block has on average ~1-2 arguments after
            // SSA reconciliation. To make the calculation straight forward, we simply
            // assume 1 argument per basic block.
            max_arg_len = cmp::max(max_arg_len, body.basic_blocks.len());
        }

        Self {
            basic_block_reverse_postorder: Vec::with_capacity_in(
                max_basic_block_len,
                alloc.clone(),
            ),
            callees: LocalVec::with_capacity_in(max_local_decl_len, alloc.clone()),
            args: Vec::with_capacity_in(max_arg_len, alloc),
        }
    }

    fn clear(&mut self) {
        self.basic_block_reverse_postorder.clear();
        self.callees.clear();
    }
}

/// A global transformation pass that performs administrative reduction.
///
/// This pass inlines trivial thunks and forwarding closures at their call sites, eliminating
/// unnecessary function call overhead introduced by earlier compilation phases.
///
/// # Example
///
/// ```ignore
/// let mut pass = AdministrativeReduction::new_in(&bump_allocator);
/// pass.run(&mut context, &mut bodies);
/// ```
pub struct AdministrativeReduction<A: Allocator> {
    alloc: A,
}

impl<A: Allocator> AdministrativeReduction<A> {
    /// Creates a new administrative reduction pass using the given allocator.
    ///
    /// The allocator is used for temporary data structures during the pass (call graph,
    /// reducibility tracking, scratch memory).
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }
}

impl<'env, 'heap, A: BumpAllocator> GlobalTransformPass<'env, 'heap>
    for AdministrativeReduction<A>
{
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        state: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        let mut reducable = Reducable::new(bodies, &self.alloc);
        if reducable.is_empty() {
            return Changed::No;
        }

        // Build the call graph (edges: caller → callee) and seed the reducibility set.
        let callgraph = CallGraph::analyze_in(bodies, &self.alloc);

        // Compute DFS postorder over the call graph. Since edges go caller → callee, postorder
        // yields callees before callers. This ensures that when we process a caller, all its
        // callees have already been transformed and (if applicable) reclassified as reducible.
        let postorder_slice = self.alloc.allocate_slice_uninit(bodies.len());
        let (postorder, rest) =
            postorder_slice.write_iter(callgraph.depth_first_forest_post_order());
        debug_assert!(rest.is_empty());
        let postorder = &*postorder;

        let mut scratch = ScratchMemory::new(bodies, &self.alloc);
        let mut changed = Changed::No;

        for &id in postorder {
            // Split the bodies slice to get mutable access to the current body while allowing
            // read-only access to all other bodies (callees) through `DisjointIdSlice`.
            let (body, rest) = DisjointIdSlice::new(bodies, id);

            let mut pass = AdministrativeReductionPass {
                callgraph: &callgraph,
                reducable: &reducable,
                bodies: rest,
                scratch: &mut scratch,
            };

            let body_changed = pass.run(context, body);
            changed |= body_changed;
            state.mark(id, body_changed);

            // If this body was transformed and wasn't already reducible, reclassify it.
            // This enables callers (processed later in postorder) to reduce calls to this body.
            // The reducibility set grows monotonically, ensuring global maximality.
            if body_changed != Changed::No && !reducable.contains(body.id) {
                reducable.insert(body);
            }
        }

        changed
    }
}

/// Per-body pass that performs administrative reduction within a single function.
///
/// This is the workhorse that actually transforms a body by inlining reducible callees.
/// It's invoked by [`AdministrativeReduction`] for each body in postorder.
struct AdministrativeReductionPass<'ctx, 'slice, 'heap, A: Allocator> {
    callgraph: &'ctx CallGraph<'heap, A>,
    reducable: &'ctx Reducable<A>,
    /// Read-only access to all bodies except the one being transformed.
    bodies: DisjointIdSlice<'slice, DefId, Body<'heap>>,

    scratch: &'ctx mut ScratchMemory<'heap, A>,
}

impl<'env, 'heap, A: Allocator> TransformPass<'env, 'heap>
    for AdministrativeReductionPass<'_, '_, 'heap, A>
{
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        // Early exit: skip bodies that have no calls to reducible functions.
        if self
            .callgraph
            .successors(body.id)
            .all(|successor| !self.reducable.contains(successor))
        {
            return Changed::No;
        }

        self.scratch.clear();

        // Temporarily take ownership of local_decls so the visitor can extend it with
        // locals from inlined callees.
        let local_decls = mem::replace(&mut body.local_decls, LocalVec::new_in(context.heap));

        let mut visitor = AdministrativeReductionVisitor {
            heap: context.heap,
            interner: context.interner,
            body: BodyHeader {
                id: body.id,
                local_decls,
            },
            callees: &mut self.scratch.callees,
            bodies: self.bodies.reborrow(),
            reducable: self.reducable,
            state: State::new(),
        };

        self.scratch
            .basic_block_reverse_postorder
            .extend_from_slice(body.basic_blocks.reverse_postorder());

        // Process basic blocks in CFG reverse postorder. The visitor handles local fixpoint
        // iteration internally: when a call is reduced, it rewinds and re-processes the newly
        // inserted statements, ensuring nested reductions are fully applied.
        for &id in &self.scratch.basic_block_reverse_postorder {
            // Propagate closure/function pointer knowledge through block parameters.
            for (local, closure) in
                propagate_block_params(&mut self.scratch.args, body, id, |operand| {
                    visitor.try_eval_callee(operand)
                })
            {
                visitor.callees.insert(local, closure);
            }

            Ok(()) =
                visitor.visit_basic_block(id, &mut body.basic_blocks.as_mut_preserving_cfg()[id]);
        }

        let changed = visitor.state.changed;
        body.local_decls = visitor.body.local_decls;

        changed.into()
    }
}
