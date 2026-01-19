mod affine;
mod dynamic;
mod estimate;
mod footprint;
pub(crate) mod range;
mod r#static;
pub(crate) mod unit;

use core::alloc::Allocator;

use hashql_core::id::bit_vec::DenseBitSet;

use self::{
    estimate::Estimate,
    footprint::{BodyFootprint, Footprint},
    range::Cardinality,
    r#static::{StaticSizeEstimation, StaticSizeEstimationCache},
};
use crate::{
    body::{
        Body,
        local::{LocalDecl, LocalVec},
    },
    context::MirContext,
    def::DefIdVec,
    pass::{
        AnalysisPass,
        analysis::dataflow::lattice::{HasBottom as _, SaturatingSemiring},
    },
};

struct SizeEstimationPass<'ctx, A: Allocator> {
    alloc: A,
    constant: StaticSizeEstimationCache<A>,
    footprints: &'ctx mut DefIdVec<BodyFootprint<A>, A>,
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
                locals[local] = Footprint {
                    units: Estimate::Constant(range),
                    cardinality: Estimate::Constant(Cardinality::one()),
                };
            } else {
                requires_dynamic_analysis.insert(local);
            }
        }

        if let Some(range) = static_size_estimation.run(body.return_type) {
            returns = Footprint {
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

        // self.footprints[body.id] = BodyFootprint { locals, returns };
    }
}
