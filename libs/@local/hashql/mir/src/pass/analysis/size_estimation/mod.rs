mod affine;
mod dynamic;
mod estimate;
mod footprint;
pub(crate) mod range;
mod r#static;
pub(crate) mod unit;

use core::alloc::Allocator;

use hashql_core::{
    graph::algorithms::{
        Tarjan,
        tarjan::{SccId, StronglyConnectedComponents},
    },
    heap::{CloneIn, Heap},
    id::{IdVec, bit_vec::DenseBitSet},
};

pub use self::{
    affine::AffineEquation,
    footprint::{BodyFootprint, Footprint},
    range::{Cardinality, InformationRange},
    unit::{Cardinal, InformationUnit},
};
use self::{
    dynamic::SizeEstimationDataflowAnalysis,
    estimate::Estimate,
    r#static::{StaticSizeEstimation, StaticSizeEstimationCache},
};
use super::{
    CallGraph, CallGraphAnalysis,
    callgraph::CallKindFilter,
    dataflow::{
        framework::{DataflowAnalysis as _, DataflowResults},
        lattice::JoinSemiLattice as _,
    },
};
use crate::{
    body::{
        Body,
        local::LocalDecl,
        terminator::{Return, TerminatorKind},
    },
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        AnalysisPass as _, GlobalAnalysisPass,
        analysis::dataflow::lattice::{HasBottom as _, SaturatingSemiring},
    },
};

pub struct SizeEstimationAnalysis<'heap, A: Allocator> {
    alloc: A,
    cache: StaticSizeEstimationCache<A>,
    footprints: Option<DefIdVec<BodyFootprint<&'heap Heap>, &'heap Heap>>,
}

impl<'heap, A: Allocator> SizeEstimationAnalysis<'heap, A> {
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        let cache = StaticSizeEstimationCache::new_in(alloc.clone());

        Self {
            alloc,
            cache,
            footprints: None,
        }
    }

    fn single(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        footprints: &mut DefIdSlice<BodyFootprint<&'heap Heap>>,
    ) where
        A: Clone,
    {
        let mut static_size_estimation = StaticSizeEstimation::new(context.env, &mut self.cache);
        let mut requires_dynamic_analysis = DenseBitSet::new_empty(body.local_decls.len());
        let mut returns_requires_dynamic_analysis = false;

        let locals = &mut footprints[body.id].locals;

        for (local, &LocalDecl { r#type, .. }) in body.local_decls.iter_enumerated() {
            // for each local decl, try to figure out if we can estimate its size, based on the type
            // of the declaration, if that isn't possible we degrade to dynamic analysis
            if let Some(range) = static_size_estimation.run(r#type) {
                locals[local] = Footprint {
                    units: Estimate::Constant(range),
                    cardinality: Estimate::Constant(Cardinality::one()),
                };
            } else {
                requires_dynamic_analysis.insert(local);
            }
        }

        let mut returns = static_size_estimation.run(body.return_type).map_or_else(
            || {
                returns_requires_dynamic_analysis = true;
                SaturatingSemiring.bottom()
            },
            |range| Footprint {
                units: Estimate::Constant(range),
                cardinality: Estimate::Constant(Cardinality::one()),
            },
        );

        // TODO: split this so we can re-use it!

        if !requires_dynamic_analysis.is_empty() || returns_requires_dynamic_analysis {
            let dynamic = SizeEstimationDataflowAnalysis::new(
                context.env,
                &body.local_decls,
                footprints,
                requires_dynamic_analysis,
                &mut self.cache,
            );

            let DataflowResults {
                analysis,
                entry_states: _,
                exit_states,
            } = dynamic.iterate_to_fixpoint_in(body, self.alloc.clone());
            let lattice = analysis.lattice_in(body, self.alloc.clone());

            // bbs are non-zero, so there's always at least one exit state, if not then that means
            // that all bb's are unreachable, in which case dynamic analysis cannot be used (because
            // we have no point to observe).
            let mut footprint: Option<BodyFootprint<A>> = None;

            for (bb, exit_state) in exit_states.into_iter_enumerated() {
                let bb = &body.basic_blocks[bb];
                let TerminatorKind::Return(Return { value }) = &bb.terminator.kind else {
                    continue;
                };

                if returns_requires_dynamic_analysis {
                    let rhs = analysis.eval_operand(&exit_state, value);

                    SaturatingSemiring.join(&mut returns, rhs.as_ref(&exit_state));
                }

                match &mut footprint {
                    Some(footprint) => {
                        lattice.join(footprint, &exit_state);
                    }
                    None => {
                        footprint = Some(exit_state);
                    }
                }
            }

            let Some(mut footprint) = footprint else {
                return;
            };
            footprint.returns = returns;

            // Move the final footprint into the heap
            CloneIn::clone_into(&footprint, &mut footprints[body.id], context.heap);
        } else {
            // args and locals have been pre-populated, only returns remains
            footprints[body.id].returns = returns;
        }
    }

    fn init_footprint(
        context: &MirContext<'_, 'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
    ) -> DefIdVec<BodyFootprint<&'heap Heap>, &'heap Heap> {
        DefIdVec::from_domain_derive_in(
            |_, body| BodyFootprint {
                args: body.args,
                locals: IdVec::from_elem_in(
                    SaturatingSemiring.bottom(),
                    body.local_decls.len(),
                    context.heap,
                ),
                returns: SaturatingSemiring.bottom(),
            },
            bodies,
            context.heap,
        )
    }
}

impl<'env, 'heap, A: Allocator + Clone> GlobalAnalysisPass<'env, 'heap>
    for SizeEstimationAnalysis<'heap, A>
{
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, bodies: &DefIdSlice<Body<'heap>>) {
        // Because we're dependent on the calls, we must first create a call graph, identify any
        // strongly connected components, try to break them up (using static analysis), and then
        // process everything.
        let cg = {
            let mut graph = CallGraph::new_in(bodies, self.alloc.clone());
            let mut visitor =
                CallGraphAnalysis::new(&mut graph).with_filter(CallKindFilter::ApplyOnly);

            for body in bodies {
                visitor.run(context, body);
            }

            graph
        };

        let scc: StronglyConnectedComponents<DefId, SccId, _, _> =
            Tarjan::new_in(&cg, self.alloc.clone()).run();
        let members = scc.members_in(&self.alloc);

        let mut footprints = Self::init_footprint(context, bodies);

        for scc in members.sccs() {
            let members = members.of(scc);

            match members {
                [] => unreachable!(),
                &[member] => {
                    self.single(context, &bodies[member], &mut footprints);
                }
                _ => {
                    // This is more complex, we need to attempt cycle breaking first, if that
                    // doesn't work we need to run fix-point iteration.
                    // We may just want to skip the cycle breaking, because fix-point would just
                    // converge to it anyway.
                }
            }
        }

        self.footprints = Some(footprints);
    }
}
