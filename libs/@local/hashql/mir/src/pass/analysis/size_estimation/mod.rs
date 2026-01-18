mod affine;
mod bandwidth;
mod estimate;
mod footprint;
pub(crate) mod range;
mod r#static;
pub(crate) mod unit;

use core::{alloc::Allocator, marker::PhantomData};

use hashql_core::id::bit_vec::DenseBitSet;

use self::{
    bandwidth::Bandwidth,
    estimate::Estimate,
    range::Cardinality,
    r#static::{StaticSizeEstimation, StaticSizeEstimationCache},
};
use super::dataflow::{framework::DataflowAnalysis, lattice::JoinSemiLattice};
use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        local::{Local, LocalDecl, LocalVec},
        location::Location,
        operand::Operand,
        statement::Statement,
        terminator::Terminator,
    },
    context::MirContext,
    def::DefIdVec,
    pass::{
        AnalysisPass,
        analysis::dataflow::lattice::{HasBottom as _, SaturatingSemiring},
    },
};

#[derive(Debug)]
struct BodyBandwith<A: Allocator> {
    locals: LocalVec<Bandwidth, A>,
    returns: Bandwidth,
}

impl<A: Allocator + Clone> Clone for BodyBandwith<A> {
    fn clone(&self) -> Self {
        Self {
            locals: self.locals.clone(),
            returns: self.returns.clone(),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        self.locals.clone_from(&source.locals);
        self.returns.clone_from(&source.returns);
    }
}

type BandwithVec<A> = DefIdVec<BodyBandwith<A>, A>;

struct Size {}

struct SizeEstimationPass<'ctx, A: Allocator> {
    alloc: A,
    constant: StaticSizeEstimationCache<A>,
    bandwidths: &'ctx mut BandwithVec<A>,
}

impl<'env, 'heap, A: Allocator + Clone> AnalysisPass<'env, 'heap> for SizeEstimationPass<'_, A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        // for each local decl, try to figure out if we can estimate its size, based on the type of
        // the declaration
        let mut static_size_estimation = StaticSizeEstimation::new(context.env, &mut self.constant);
        let mut requires_dynamic_analysis = DenseBitSet::new_empty(body.local_decls.len() + 1); // last bit is for the return type
        let semiring = SaturatingSemiring;

        let mut returns = semiring.bottom();
        let mut locals =
            LocalVec::from_domain_in(semiring.bottom(), &body.local_decls, self.alloc.clone());

        for (local, &LocalDecl { r#type, .. }) in body.local_decls.iter_enumerated() {
            if let Some(range) = static_size_estimation.run(r#type) {
                locals[local] = Bandwidth {
                    units: Estimate::Constant(range),
                    cardinality: Estimate::Constant(Cardinality::one()),
                };
            } else {
                requires_dynamic_analysis.insert(local);
            }
        }

        if let Some(range) = static_size_estimation.run(body.return_type) {
            returns = Bandwidth {
                units: Estimate::Constant(range),
                cardinality: Estimate::Constant(Cardinality::one()),
            };
        } else {
            requires_dynamic_analysis.insert(body.local_decls.bound());
        }

        if !requires_dynamic_analysis.is_empty() {
            todo!(
                "we need to run dataflow analysis to determine the size of the locals not yet set"
            );
            // This gets more complicated, because here we now need to run fixpoint analysis, but we
            // already have the dataflow framework so that's great!
        }

        self.bandwidths[body.id] = BodyBandwith { locals, returns };
    }
}

// TODO: idk if this is the right way tbh, this feels like shoehorning this, but then again, it
// would work... the problem is that I dont know how to extract the value.
struct SizeEstimationDataflowAnalysis;

#[derive(Debug)]
struct BandwidthLattice<A> {
    _marker: PhantomData<A>,
}

impl<A> Copy for BandwidthLattice<A> {}
impl<A> Clone for BandwidthLattice<A> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<A> JoinSemiLattice<Bandwidth> for BandwidthLattice<A> {
    fn join(&self, lhs: &mut Bandwidth, rhs: &Bandwidth) -> bool {
        todo!()
    }
}

impl<A: Allocator> JoinSemiLattice<BodyBandwith<A>> for BandwidthLattice<A> {
    fn join(&self, lhs: &mut BodyBandwith<A>, rhs: &BodyBandwith<A>) -> bool {
        let mut changed = false;

        for (lhs_local, rhs_local) in lhs.locals.iter_mut().zip(rhs.locals.iter()) {
            changed |= self.join(lhs_local, rhs_local);
        }

        changed
    }
}

impl<'heap> DataflowAnalysis<'heap> for SizeEstimationDataflowAnalysis {
    type Domain<A: Allocator> = BodyBandwith<A>;
    type Lattice<A: Allocator> = BandwidthLattice<A>;
    type SwitchIntData = !;

    fn lattice_in<A: Allocator>(&self, body: &Body<'heap>, alloc: A) -> Self::Lattice<A> {
        todo!()
    }

    fn initialize_boundary<A: Allocator>(&self, body: &Body<'heap>, domain: &mut Self::Domain<A>) {
        todo!()
    }

    fn transfer_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        // check if the statement location requires adjustment, otherwise just... don't.
    }

    fn transfer_edge<A: Allocator>(
        &self,
        source_block: BasicBlockId,
        source_args: &[Operand<'heap>],

        target_block: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
        // our domain must be the `BodyBandwidth` I think, with an efficient clone from?
        // for places we estimate, the root is easy for places we take a look at the resulting type,
        // if it's easy? pog, otherwise? We just take the place as the worst estimate, if anything
        // we narrow in places, so this is a good estimation.
    }

    fn transfer_terminator<A: Allocator>(
        &self,
        location: Location,
        terminator: &Terminator<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        // This is only needed on return
    }
}
