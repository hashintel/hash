//! Pre-inlining optimization pass.
//!
//! This module contains the [`PreInline`] pass, a thin wrapper around [`Canonicalization`] that
//! runs with settings tuned for pre-inlining optimization.

use hashql_core::heap::ScopeAllocator;

use super::{Canonicalization, CanonicalizationConfig};
use crate::{
    body::Body,
    context::MirContext,
    def::DefIdSlice,
    pass::{Changed, GlobalTransformPass, GlobalTransformState},
};

/// Pre-inlining optimization driver.
///
/// A thin wrapper around [`Canonicalization`] configured for pre-inlining optimization. By running
/// canonicalization before inlining, we ensure that:
///
/// - Inlined code is already simplified, reducing work after inlining
/// - Call sites see optimized callees, enabling better inlining decisions
/// - The overall MIR size is reduced before the potential code explosion from inlining
///
/// See [`Canonicalization`] for details on the pass ordering and implementation.
pub struct PreInline<'scratch, S> {
    canonicalization: Canonicalization<'scratch, S>,
}

impl<'scratch, S> PreInline<'scratch, S> {
    /// Creates a new pre-inlining pass with the given allocator.
    ///
    /// The allocator is used for temporary data structures within sub-passes and is reset
    /// between pass invocations.
    pub const fn new_in(alloc: &'scratch mut S) -> Self {
        Self {
            canonicalization: Canonicalization::new_in(
                CanonicalizationConfig { max_iterations: 8 },
                alloc,
            ),
        }
    }
}

impl<'env, 'heap, 'alloc, S> GlobalTransformPass<'env, 'heap> for PreInline<'_, S>
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
