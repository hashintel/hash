//! Pre-inlining optimization pass.
//!
//! This module contains the [`PreInline`] pass, which runs a fixpoint loop of local and global
//! transformations to optimize MIR bodies before inlining occurs.

use core::alloc::Allocator;

use hashql_core::heap::BumpAllocator;

use super::{Canonicalization, CanonicalizationConfig};
use crate::{
    body::Body,
    context::MirContext,
    def::DefIdSlice,
    pass::{Changed, GlobalTransformPass, GlobalTransformState},
};

/// Pre-inlining optimization driver.
///
/// This pass orchestrates a sequence of local and global transformations in a fixpoint loop,
/// preparing MIR bodies for inlining. By running these optimizations before inlining, we ensure
/// that:
///
/// - Inlined code is already simplified, reducing work after inlining
/// - Call sites see optimized callees, enabling better inlining decisions
/// - The overall MIR size is reduced before the potential code explosion from inlining
///
/// # Pass Ordering
///
/// The pass ordering is carefully chosen so each pass feeds the next with new opportunities:
///
/// 1. **Administrative reduction** - Removes structural clutter and normalizes shape
/// 2. **Instruction simplification** - Constant folding and algebraic simplification
/// 3. **Value propagation** (FS/CP alternating) - Propagates values through the code
/// 4. **Dead store elimination** - Removes stores made dead by propagation
/// 5. **CFG simplification** - Cleans up control flow after local changes
///
/// # Implementation Notes
///
/// This pass manages its own per-body change tracking and does not populate the caller-provided
/// [`GlobalTransformState`]. Callers receive a combined [`Changed`] result indicating whether any
/// body was modified.
pub struct PreInline<A: Allocator> {
    canonicalization: Canonicalization<A>,
}

impl<A: BumpAllocator> PreInline<A> {
    /// Creates a new pre-inlining pass with the given allocator.
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

impl<'env, 'heap, A: BumpAllocator> GlobalTransformPass<'env, 'heap> for PreInline<A> {
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        state: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        self.canonicalization.run(context, state, bodies)
    }
}
