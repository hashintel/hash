//! Post-inlining optimization pass.
//!
//! Runs [`Canonicalization`] to clean up redundancy from inlining, then [`TraversalExtraction`]
//! to materialize vertex projections in graph read filter bodies.
//!
//! After running, call [`PostInline::finish`] to retrieve the [`Traversals`] maps.

use core::alloc::Allocator;

use hashql_core::heap::{BumpAllocator, Heap};

use super::{Canonicalization, CanonicalizationConfig, TraversalExtraction, Traversals};
use crate::{
    body::Body,
    context::MirContext,
    def::{DefIdSlice, DefIdVec},
    pass::{Changed, GlobalTransformPass, GlobalTransformState, TransformPass as _},
};

pub struct PostInlineResidual<'heap> {
    pub traversals: DefIdVec<Option<Traversals<'heap>>, &'heap Heap>,
}

/// Post-inlining optimization driver.
///
/// A thin wrapper around [`Canonicalization`] configured for post-inlining optimization. By running
/// canonicalization after inlining, we ensure that:
///
/// - Opportunities exposed by inlining (constant propagation, dead code) are exploited
/// - Redundant operations introduced during inlining are eliminated
/// - The final MIR is fully simplified before code generation
///
/// Uses a higher iteration limit than [`super::PreInline`] (16 vs 8) because inlining can expose
/// more optimization opportunities that may require additional passes to fully resolve.
///
/// See [`Canonicalization`] for details on the pass ordering and implementation.
pub struct PostInline<'heap, A: Allocator> {
    canonicalization: Canonicalization<A>,

    traversals: DefIdVec<Option<Traversals<'heap>>, &'heap Heap>,
}

impl<'heap, A: BumpAllocator> PostInline<'heap, A> {
    /// Creates a new post-inlining pass with the given allocator.
    ///
    /// The allocator is used for temporary data structures within sub-passes and is reset
    /// between pass invocations.
    pub const fn new_in(heap: &'heap Heap, alloc: A) -> Self {
        Self {
            canonicalization: Canonicalization::new_in(
                CanonicalizationConfig { max_iterations: 16 },
                alloc,
            ),
            traversals: DefIdVec::new_in(heap),
        }
    }

    /// Consumes the pass and returns accumulated results.
    ///
    /// The returned [`PostInlineResidual`] contains traversal maps for each graph read filter
    /// body processed during the pass run.
    pub fn finish(self) -> PostInlineResidual<'heap> {
        PostInlineResidual {
            traversals: self.traversals,
        }
    }
}

impl<'env, 'heap, A: BumpAllocator> GlobalTransformPass<'env, 'heap> for PostInline<'heap, A> {
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        state: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        let mut changed = Changed::No;
        changed |= self.canonicalization.run(context, state, bodies);

        self.canonicalization.allocator_mut().scoped(|alloc| {
            let mut extraction = TraversalExtraction::new_in(alloc);

            for (id, body) in bodies.iter_enumerated_mut() {
                let changed_body = extraction.run(context, body);

                if let Some(traversal) = extraction.take_traversals() {
                    self.traversals.insert(id, traversal);
                }

                state.mark(id, changed_body);
                changed |= changed_body;
            }
        });

        changed
    }
}
