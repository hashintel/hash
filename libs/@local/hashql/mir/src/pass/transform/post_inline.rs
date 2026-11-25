//! Post-inlining optimization pass.
//!
//! Runs [`Canonicalization`] to clean up redundancy from inlining.

use hashql_core::heap::ScopeAllocator;

use super::{Canonicalization, CanonicalizationConfig};
use crate::{
    body::Body,
    context::MirContext,
    def::DefIdSlice,
    pass::{Changed, GlobalTransformPass, GlobalTransformState},
};

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
pub struct PostInline<'scratch, S> {
    canonicalization: Canonicalization<'scratch, S>,
}

impl<'scratch, S> PostInline<'scratch, S> {
    /// Creates a new post-inlining pass with the given allocator.
    ///
    /// The allocator is used for temporary data structures within sub-passes and is reset
    /// between pass invocations.
    pub const fn new_in(alloc: &'scratch mut S) -> Self {
        Self {
            canonicalization: Canonicalization::new_in(
                CanonicalizationConfig { max_iterations: 16 },
                alloc,
            ),
        }
    }
}

impl<'env, 'heap, 'alloc, S> GlobalTransformPass<'env, 'heap> for PostInline<'_, S>
where
    S: ScopeAllocator<'alloc>,
{
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        state: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        self.canonicalization.run(context, state, bodies)
    }
}
