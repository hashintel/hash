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
    heap::Heap,
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
        local::{Local, LocalDecl},
        terminator::{Return, TerminatorKind},
    },
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        AnalysisPass as _, GlobalAnalysisPass,
        analysis::dataflow::lattice::{HasBottom as _, SaturatingSemiring},
    },
};

struct DynamicComponents {
    inner: DenseBitSet<Local>,
}

impl DynamicComponents {
    fn new(body: &Body<'_>) -> Self {
        let inner = DenseBitSet::new_empty(body.local_decls.len() + 1);
        Self { inner }
    }

    const fn returns_slot(&self) -> Local {
        Local::new(self.inner.domain_size() - 1)
    }

    fn mark(&mut self, local: Local) {
        self.inner.insert(local);
    }

    fn mark_return(&mut self) {
        self.inner.insert(self.returns_slot());
    }

    fn dynamic_return(&self) -> bool {
        self.inner.contains(self.returns_slot())
    }

    fn requires_dynamic_analysis(&self) -> bool {
        !self.inner.is_empty()
    }

    const fn as_set(&self) -> &DenseBitSet<Local> {
        &self.inner
    }
}

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

    fn static_analysis<H: Allocator>(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        footprints: &mut DefIdSlice<BodyFootprint<H>>,
    ) -> DynamicComponents {
        let mut dynamic = DynamicComponents::new(body);
        let mut analysis = StaticSizeEstimation::new(context.env, &mut self.cache);

        let locals = &mut footprints[body.id].locals;

        for (local, &LocalDecl { r#type, .. }) in body.local_decls.iter_enumerated() {
            if let Some(range) = analysis.run(r#type) {
                locals[local] = Footprint {
                    units: Estimate::Constant(range),
                    cardinality: Estimate::Constant(Cardinality::one()),
                };
            } else {
                dynamic.mark(local);
            }
        }

        if let Some(returns) = analysis.run(body.return_type) {
            footprints[body.id].returns = Footprint {
                units: Estimate::Constant(returns),
                cardinality: Estimate::Constant(Cardinality::one()),
            };
        } else {
            dynamic.mark_return();
        }

        dynamic
    }

    fn dynamic_analysis(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        footprints: &mut DefIdSlice<BodyFootprint<&'heap Heap>>,
        dynamic: &DynamicComponents,
    ) -> bool
    where
        A: Clone,
    {
        let analysis = SizeEstimationDataflowAnalysis::new(
            context.env,
            &body.local_decls,
            footprints,
            dynamic.as_set(),
            &mut self.cache,
        );

        let DataflowResults {
            analysis,
            entry_states: _,
            exit_states,
        } = analysis.iterate_to_fixpoint_in(body, self.alloc.clone());

        let lattice = analysis.lattice_in(body, context.heap);

        let lookup = analysis.into_lookup();
        let body_footprint = &mut footprints[body.id];

        let mut changed = false;
        for (bb, exit_state) in exit_states.into_iter_enumerated() {
            let bb = &body.basic_blocks[bb];
            let TerminatorKind::Return(Return { value }) = &bb.terminator.kind else {
                continue;
            };

            if dynamic.dynamic_return() {
                let rhs = lookup.operand(&exit_state, value);

                SaturatingSemiring.join(&mut body_footprint.returns, rhs.as_ref(&exit_state));
            }

            changed |= lattice.join(body_footprint, &exit_state);
        }

        changed
    }

    fn single(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        footprints: &mut DefIdSlice<BodyFootprint<&'heap Heap>>,
    ) where
        A: Clone,
    {
        let dynamic = self.static_analysis(context, body, footprints);

        if dynamic.requires_dynamic_analysis() {
            self.dynamic_analysis(context, body, footprints, &dynamic);
        }
    }

    fn multiple(
        &mut self,
        context: &MirContext<'_, 'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
        members: &[DefId],
        footprints: &mut DefIdSlice<BodyFootprint<&'heap Heap>>,
    ) where
        A: Clone,
    {
        const MAX_ITERATIONS: usize = 16;

        let mut dynamic = Vec::with_capacity_in(members.len(), self.alloc.clone());
        for &member in members {
            dynamic.push(self.static_analysis(context, &bodies[member], footprints));
        }

        // We now enter fixpoint iteration, until we hit MAX_ITERATIONS or nothing changes anymore
        for _ in 0..MAX_ITERATIONS {
            let mut changed = false;

            for (&member, dynamic) in members.iter().zip(&dynamic) {
                if dynamic.requires_dynamic_analysis() {
                    changed |= self.dynamic_analysis(context, &bodies[member], footprints, dynamic);
                }
            }

            if !changed {
                break;
            }
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
                    self.multiple(context, bodies, members, &mut footprints);
                }
            }
        }

        self.footprints = Some(footprints);
    }
}
