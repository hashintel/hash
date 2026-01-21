//! Size estimation analysis for MIR.
//!
//! This module provides static and dynamic analysis to estimate the size of values flowing through
//! a MIR program. The analysis is conservative during dynamic analysis, preferring underestimation
//! over widening to unknown values.
//!
//! # Architecture
//!
//! The analysis operates in two phases:
//!
//! 1. **Static analysis**: Estimates sizes purely from type information (primitives, structs,
//!    tuples, unions, intersections). Types that cannot be statically sized (e.g., lists, dicts)
//!    are marked for dynamic analysis.
//!
//! 2. **Dynamic analysis**: Uses dataflow analysis to track how sizes propagate through the
//!    program. Sizes that depend on function parameters are represented as affine equations (y =
//!    c₁·a + c₂·b + ... + k) where the coefficients track the contribution of each parameter.
//!
//! # Key Types
//!
//! - [`InformationUnit`]: A scalar measure of information content (abstract size units)
//! - [`InformationRange`]: Min/max bounds on information content, with support for unbounded upper
//!   limits
//! - [`Cardinal`] / [`Cardinality`]: Element count (how many items in a collection)
//! - [`Footprint`]: Combined measure of both units and cardinality
//! - [`AffineEquation`]: Represents size as a linear function of input parameters
//!
//! # SCC Processing
//!
//! Mutually recursive functions are handled by:
//! 1. Building a call graph and identifying strongly connected components (SCCs)
//! 2. Processing SCCs in topological order
//! 3. Using fixpoint iteration within each SCC until convergence

mod affine;
mod dynamic;
mod estimate;
mod footprint;
pub(crate) mod range;
mod r#static;
#[cfg(test)]
mod tests;
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

/// Tracks which locals require dynamic (dataflow) analysis.
///
/// After static analysis, locals whose types cannot be statically sized are marked here.
/// The return slot is tracked separately using a synthetic local beyond the normal local range.
struct PendingDataflow {
    inner: DenseBitSet<Local>,
}

impl PendingDataflow {
    fn new(body: &Body<'_>) -> Self {
        // +1 for the synthetic return slot
        let inner = DenseBitSet::new_empty(body.local_decls.len() + 1);
        Self { inner }
    }

    /// Returns the synthetic local used to track whether the return type needs dynamic analysis.
    const fn return_slot(&self) -> Local {
        Local::new(self.inner.domain_size() - 1)
    }

    fn insert(&mut self, local: Local) {
        self.inner.insert(local);
    }

    fn insert_return(&mut self) {
        self.inner.insert(self.return_slot());
    }

    fn contains_return(&self) -> bool {
        self.inner.contains(self.return_slot())
    }

    fn any(&self) -> bool {
        !self.inner.is_empty()
    }

    const fn as_set(&self) -> &DenseBitSet<Local> {
        &self.inner
    }
}

/// Global analysis pass that estimates the size of values in all function bodies.
///
/// The analysis produces a [`BodyFootprint`] for each function, containing size estimates
/// for all locals and the return value. Sizes are expressed as [`Footprint`]s which may be
/// either constant or affine expressions depending on function parameters.
pub struct SizeEstimationAnalysis<'heap, A: Allocator> {
    alloc: A,
    cache: StaticSizeEstimationCache<A>,
    footprints: Option<DefIdVec<BodyFootprint<&'heap Heap>, &'heap Heap>>,
}

impl<'heap, A: Allocator> SizeEstimationAnalysis<'heap, A> {
    /// Creates a new size estimation analysis using the given allocator.
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

    /// Finishes the analysis and returns the computed footprints.
    ///
    /// # Panics
    /// Panics if the analysis pass has not been run before.
    pub fn finish(mut self) -> DefIdVec<BodyFootprint<&'heap Heap>, &'heap Heap> {
        self.footprints
            .take()
            .expect("finish called before analysis")
    }

    /// Performs static analysis on a single body, marking locals that need dynamic analysis.
    ///
    /// Returns a [`DynamicComponents`] indicating which locals could not be statically sized.
    fn static_analysis<H: Allocator>(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        footprints: &mut DefIdSlice<BodyFootprint<H>>,
    ) -> PendingDataflow {
        let mut pending = PendingDataflow::new(body);
        let mut analysis = StaticSizeEstimation::new(context.env, &mut self.cache);

        let locals = &mut footprints[body.id].locals;

        for (local, &LocalDecl { r#type, .. }) in body.local_decls.iter_enumerated() {
            if let Some(range) = analysis.run(r#type) {
                locals[local] = Footprint {
                    units: Estimate::Constant(range),
                    cardinality: Estimate::Constant(Cardinality::one()),
                };
            } else {
                pending.insert(local);
            }
        }

        if let Some(returns) = analysis.run(body.return_type) {
            footprints[body.id].returns = Footprint {
                units: Estimate::Constant(returns),
                cardinality: Estimate::Constant(Cardinality::one()),
            };
        } else {
            pending.insert_return();
        }

        pending
    }

    /// Performs dataflow analysis to refine size estimates for dynamically-sized locals.
    ///
    /// Returns `true` if any footprint changed, enabling fixpoint iteration for SCCs.
    fn dynamic_analysis(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        footprints: &mut DefIdSlice<BodyFootprint<&'heap Heap>>,
        pending: &PendingDataflow,
    ) -> bool
    where
        A: Clone,
    {
        let analysis = SizeEstimationDataflowAnalysis::new(
            context.env,
            &body.local_decls,
            footprints,
            pending.as_set(),
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

            if pending.contains_return() {
                let rhs = lookup.operand(&exit_state, value);

                changed |=
                    SaturatingSemiring.join(&mut body_footprint.returns, rhs.as_ref(&exit_state));
            }

            changed |= lattice.join(body_footprint, &exit_state);
        }

        changed
    }

    /// Analyzes a single non-recursive function body.
    fn single(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        footprints: &mut DefIdSlice<BodyFootprint<&'heap Heap>>,
    ) where
        A: Clone,
    {
        let pending = self.static_analysis(context, body, footprints);

        if pending.any() {
            self.dynamic_analysis(context, body, footprints, &pending);
        }
    }

    /// Analyzes an SCC containing multiple mutually recursive functions.
    ///
    /// Uses fixpoint iteration until all footprints stabilize or `MAX_ITERATIONS` is reached.
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

        for _ in 0..MAX_ITERATIONS {
            let mut changed = false;

            for (&member, dynamic) in members.iter().zip(&dynamic) {
                if dynamic.any() {
                    changed |= self.dynamic_analysis(context, &bodies[member], footprints, dynamic);
                }
            }

            if !changed {
                break;
            }
        }
    }

    /// Initializes all body footprints to bottom (empty ranges).
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
        // Build a call graph to identify SCCs. We process SCCs in topological order so that
        // callee footprints are available when analyzing callers.
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
