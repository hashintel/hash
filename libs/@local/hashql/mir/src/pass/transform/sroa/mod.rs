use core::mem;

use hashql_core::heap::{Heap, Scratch};

use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        local::{Local, LocalVec},
        location::Location,
        place::{DefUse, PlaceContext},
    },
    context::MirContext,
    pass::{AnalysisPass, TransformPass, analysis::DataDependencyAnalysis},
    visit::Visitor,
};

struct DefVisitor<'scratch> {
    locations: LocalVec<Location, &'scratch Scratch>,
}

impl Visitor<'_> for DefVisitor<'_> {
    type Result = Result<(), !>;

    fn visit_local(
        &mut self,
        location: Location,
        context: PlaceContext,
        local: Local,
    ) -> Self::Result {
        if context.into_def_use() != Some(DefUse::Def) {
            return Ok(());
        }

        let old = mem::replace(&mut self.locations[local], location);
        debug_assert_ne!(old, Location::PLACEHOLDER, "SSA property has been violated");

        Ok(())
    }
}

// Scalar Replacement of Aggregate Types (SROA)
pub struct Sroa {
    scratch: Scratch,
}

impl Sroa {
    pub fn new() -> Self {
        Self {
            scratch: Scratch::new(),
        }
    }
}

impl<'env, 'heap> TransformPass<'env, 'heap> for Sroa {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        // The first run of the pass is to remove any intermediate locals
        let mut visitor = DefVisitor {
            locations: LocalVec::from_domain_in(
                Location::PLACEHOLDER,
                &body.local_decls,
                &self.scratch,
            ),
        };
        visitor.visit_body(body);

        let mut analysis = DataDependencyAnalysis::new_in(&self.scratch);
        analysis.run(context, body);
        let analysis = analysis.finish();
        let transient = analysis.transient(context.interner);

        for (local, &location) in visitor.locations.iter_enumerated() {
            if location == Location::PLACEHOLDER {
                continue; // unused variable
            }
        }

        // SROA via fixpoint iteration, unlike other passes, which use block-based fixpoint
        // iteration, this pass uses body-based fixpoint iteration.
        // This more coarse-grained approach is required, as analysis only happens over a body, in
        // most cases the iteration count is at most 2.
        for block in body.basic_blocks.reverse_postorder() {
            // Perform SROA on the block
            todo!()
        }
    }
}
