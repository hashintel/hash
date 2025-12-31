use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{heap::ResetAllocator, id::bit_vec::DenseBitSet};

use super::{
    AdministrativeReduction, CfgSimplify, DeadStoreElimination, ForwardSubstitution, InstSimplify,
};
use crate::{
    body::Body,
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        Changed, GlobalTransformPass, GlobalTransformState, TransformPass,
        transform::CopyPropagation,
    },
};

pub struct PreInlining<A: Allocator> {
    alloc: A,
}

impl<A: ResetAllocator> PreInlining<A> {
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }

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
        let pass = CopyPropagation::new_in(&mut self.alloc);
        Self::run_local_pass(context, bodies, pass, unstable, state)
    }

    fn cfg_simplify<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        let pass = CfgSimplify::new_in(&mut self.alloc);
        Self::run_local_pass(context, bodies, pass, unstable, state)
    }

    fn inst_simplify<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        let pass = InstSimplify::new_in(&mut self.alloc);
        Self::run_local_pass(context, bodies, pass, unstable, state)
    }

    fn forward_substitution<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        let pass = ForwardSubstitution::new_in(&mut self.alloc);
        Self::run_local_pass(context, bodies, pass, unstable, state)
    }

    fn administrative_reduction<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,

        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        let pass = AdministrativeReduction::new_in(&mut self.alloc);
        Self::run_global_pass(context, bodies, pass, state)
    }

    fn dse<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        unstable: &DenseBitSet<DefId>,
        state: &mut DefIdSlice<Changed>,
    ) -> Changed {
        let pass = DeadStoreElimination::new_in(&mut self.alloc);
        Self::run_local_pass(context, bodies, pass, unstable, state)
    }
}

const MAX_ITERATIONS: usize = 16;

impl<'env, 'heap, A: ResetAllocator> GlobalTransformPass<'env, 'heap> for PreInlining<A> {
    #[expect(clippy::integer_division_remainder_used)]
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        _: &mut GlobalTransformState<'_>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        // We would be able to move this to the scratch space, if we only had proper checkpointing
        // support.
        let mut state = DefIdVec::from_domain_in(Changed::No, bodies, Global);
        let mut unstable = DenseBitSet::new_filled(bodies.len());

        // Before we do anything we CP + CFG to ensure that we trim the really obvious dead code
        // because doing any more advanced optimizations. This gets rid of cases like `if true then
        // ... else ...`

        let mut global_changed = Changed::No;
        global_changed |= self.copy_propagation(context, bodies, &unstable, &mut state);
        global_changed |= self.cfg_simplify(context, bodies, &unstable, &mut state);

        let mut iter = 0;
        loop {
            if iter >= MAX_ITERATIONS {
                break;
            }

            // Reset the state
            state.as_raw_mut().fill(Changed::No);

            let mut changed = Changed::No;
            changed |= self.administrative_reduction(context, bodies, &mut state);
            changed |= self.inst_simplify(context, bodies, &unstable, &mut state);

            // FS is a lot more aggressive than CP, but also a lot more expensive, hence we only do
            // it every other iteration, but crucially, we do it in the first iteration, so that we
            // don't miss any obvious opportunities.
            changed |= if iter % 2 == 0 {
                self.forward_substitution(context, bodies, &unstable, &mut state)
            } else {
                self.copy_propagation(context, bodies, &unstable, &mut state)
            };

            changed |= self.dse(context, bodies, &unstable, &mut state);
            changed |= self.cfg_simplify(context, bodies, &unstable, &mut state);

            global_changed |= changed;
            if changed == Changed::No {
                break;
            }

            // State tells us if there are any bodies, which haven't had any changes, if that is the
            // case, remove them from the unstable list, this enables us to be monotonically
            // decreasing.
            for (id, &changed) in state.iter_enumerated() {
                if changed == Changed::No {
                    unstable.remove(id);
                } else {
                    // Global passes may add them back, due to new opportunities
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
