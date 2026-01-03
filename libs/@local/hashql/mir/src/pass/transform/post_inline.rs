//! Post-inlining optimization pass.
//!
//! This module contains the [`PostInline`] pass, a thin wrapper around [`Canonicalization`] that
//! runs with settings tuned for post-inlining optimization.

use core::alloc::Allocator;

use hashql_core::heap::BumpAllocator;

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
pub struct PostInline<A: Allocator> {
    canonicalization: Canonicalization<A>,
}

impl<A: BumpAllocator> PostInline<A> {
    /// Creates a new post-inlining pass with the given allocator.
    ///
    /// The allocator is used for temporary data structures within sub-passes and is reset
    /// between pass invocations.
    pub const fn new_in(alloc: A) -> Self {
        Self {
            canonicalization: Canonicalization::new_in(
                CanonicalizationConfig { max_iterations: 16 },
                alloc,
            ),
        }
    }
}

impl<'env, 'heap, A: BumpAllocator> GlobalTransformPass<'env, 'heap> for PostInline<A> {
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        state: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        self.canonicalization.run(context, state, bodies)
    }
}
