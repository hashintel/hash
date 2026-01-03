//! Pre-inlining optimization pass.
//!
//! This module contains the [`PreInlining`] pass, which runs a fixpoint loop of local and global
//! transformations to optimize MIR bodies before inlining occurs.

use core::alloc::Allocator;

use hashql_core::{heap::BumpAllocator, id::bit_vec::DenseBitSet};

use super::{
    AdministrativeReduction, CfgSimplify, DeadStoreElimination, ForwardSubstitution, InstSimplify,
};
use crate::{
    body::Body,
    context::MirContext,
    def::{DefId, DefIdSlice},
    pass::{
        Changed, GlobalTransformPass, GlobalTransformState, TransformPass,
        transform::CopyPropagation,
    },
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
pub struct PreInlining<A: Allocator> {
    alloc: A,
}

impl<A: BumpAllocator> PreInlining<A> {
    /// Creates a new pre-inlining pass with the given allocator.
    ///
    /// The allocator is used for temporary data structures within sub-passes and is reset
    /// between pass invocations.
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }

    /// Runs a local transform pass on all unstable bodies.
    ///
    /// Only bodies in the `unstable` set are processed. The `state` slice is updated to track
    /// which bodies were modified.
    fn run_local_pass<'env, 'heap>(
        context: &mut MirContext<'env, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        mut pass: impl TransformPass<'env, 'heap>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        let mut changed = Changed::No;

        for (id, body) in bodies.iter_enumerated_mut() {
            if !unstable.contains(id) {
                continue;
            }

            let result = pass.run(context, body);
            changed |= result;
            state[id] |= result;
        }

        changed
    }

    /// Runs a global transform pass on all bodies.
    ///
    /// Unlike local passes, global passes have access to all bodies and can perform
    /// inter-procedural transformations. The `state` slice is updated by the pass to track
    /// which bodies were modified.
    fn run_global_pass<'env, 'heap>(
        context: &mut MirContext<'env, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        mut pass: impl GlobalTransformPass<'env, 'heap>,

        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        pass.run(context, &mut GlobalTransformState::new(state), bodies)
    }

    fn copy_propagation<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        self.alloc.scoped(|alloc| {
            let pass = CopyPropagation::new_in(alloc);
            Self::run_local_pass(context, bodies, pass, unstable, state)
        })
    }

    fn cfg_simplify<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        self.alloc.scoped(|alloc| {
            let pass = CfgSimplify::new_in(alloc);
            Self::run_local_pass(context, bodies, pass, unstable, state)
        })
    }

    fn inst_simplify<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        self.alloc.scoped(|alloc| {
            let pass = InstSimplify::new_in(alloc);
            Self::run_local_pass(context, bodies, pass, unstable, state)
        })
    }

    fn forward_substitution<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        self.alloc.scoped(|alloc| {
            let pass = ForwardSubstitution::new_in(alloc);
            Self::run_local_pass(context, bodies, pass, unstable, state)
        })
    }

    fn administrative_reduction<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,

        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        self.alloc.scoped(|alloc| {
            let pass = AdministrativeReduction::new_in(alloc);
            Self::run_global_pass(context, bodies, pass, state)
        })
    }

    fn dse<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        self.alloc.scoped(|alloc| {
            let pass = DeadStoreElimination::new_in(alloc);
            Self::run_local_pass(context, bodies, pass, unstable, state)
        })
    }
}

const MAX_ITERATIONS: usize = 16;

impl<'env, 'heap, A: BumpAllocator> GlobalTransformPass<'env, 'heap> for PreInlining<A> {
    #[expect(clippy::integer_division_remainder_used)]
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        _: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        // We allocate state on the heap rather than scratch because bump scopes require
        // `&mut` access across iterations, and our generic allocator can't express the
        // necessary lifetime bounds cleanly (limitation of the underlying bump-scope crate).
        // Acceptable since this meta-pass runs once and the data is a single byte per body.
        let state = {
            let uninit = context.heap.allocate_slice_uninit(bodies.len());
            let init = uninit.write_filled(Changed::No);

            DefIdSlice::from_raw_mut(init)
        };
        let mut unstable = DenseBitSet::new_filled(bodies.len());

        // Pre-pass: run CP + CFG once before the fixpoint loop.
        //
        // Both passes are cheap and effective on obvious cases (e.g., `if true { ... } else { ...
        // }`). CP exposes constant conditions; CFG then prunes unreachable blocks and
        // merges straight-line code. This shrinks the MIR upfront so more expensive passes
        // run on smaller, cleaner bodies.
        let mut global_changed = Changed::No;
        global_changed |= self.copy_propagation(context, bodies, &unstable, state);
        global_changed |= self.cfg_simplify(context, bodies, &unstable, state);

        let mut iter = 0;
        loop {
            if iter >= MAX_ITERATIONS {
                break;
            }

            // Reset per-iteration state to track which bodies change in this iteration only.
            state.as_raw_mut().fill(Changed::No);

            // The pass ordering is chosen so each pass feeds the next with new opportunities:
            //
            // 1. AR: Removes structural clutter (unnecessary wrappers, trivial blocks/calls) and
            //    normalizes shape, exposing simpler instructions for later passes.
            // 2. IS: Simplifies individual instructions (constant folding, algebraic
            //    simplification) given the cleaner structure, producing canonical RHS values ideal
            //    for propagation.
            // 3. FS / CP: Propagates values through the code, eliminating temporaries. After
            //    propagation, many stores become unused.
            // 4. DSE: Removes stores made dead by propagation. Dropping these often empties blocks.
            // 5. CS: Cleans up CFG after local changes (empty blocks, unconditional edges),
            //    producing a minimal CFG that maximizes the next iteration's effectiveness.

            let mut changed = Changed::No;
            changed |= self.administrative_reduction(context, bodies, state);
            changed |= self.inst_simplify(context, bodies, &unstable, state);

            // FS vs CP strategy: ForwardSubstitution is more powerful but expensive;
            // CopyPropagation is cheaper but weaker. We start with FS (iter=0) to
            // aggressively expose the biggest opportunities early when there's most
            // redundancy. Subsequent iterations alternate: CP maintains propagation
            // cheaply, while periodic FS picks up deeper opportunities.
            changed |= if iter % 2 == 0 {
                self.forward_substitution(context, bodies, &unstable, state)
            } else {
                self.copy_propagation(context, bodies, &unstable, state)
            };

            changed |= self.dse(context, bodies, &unstable, state);
            changed |= self.cfg_simplify(context, bodies, &unstable, state);

            global_changed |= changed;
            if changed == Changed::No {
                break;
            }

            // Update the unstable set based on this iteration's results. Bodies that had no changes
            // are removed (monotonically decreasing), but global passes may re-add bodies by
            // creating new optimization opportunities in previously stable functions.
            for (id, &changed) in state.iter_enumerated() {
                if changed == Changed::No {
                    unstable.remove(id);
                } else {
                    unstable.insert(id);
                }
            }

            if unstable.is_empty() {
                break;
            }

            iter += 1;
        }

        global_changed
    }
}
