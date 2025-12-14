use core::alloc::Allocator;

use hashql_core::{collections::WorkQueue, heap::Scratch, id::bit_vec::DenseBitSet};

use crate::{
    body::{
        Body,
        local::{Local, LocalVec},
        location::Location,
        place::{DefUse, PlaceContext},
    },
    context::MirContext,
    pass::{AnalysisPass as _, TransformPass, analysis::DataDependencyAnalysis},
    visit::Visitor,
};

pub struct DeadStatementElimination {
    scratch: Scratch,
}

impl<'env, 'heap> TransformPass<'env, 'heap> for DeadStatementElimination {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let mut analysis = DataDependencyAnalysis::new_in(&self.scratch);
        analysis.run(context, body);
        let analysis = analysis.finish();

        let mut visitor = FindUseVisitor {
            uses: LocalVec::from_domain_in(0, &body.local_decls, &self.scratch),
        };
        visitor.visit_body(body);

        let mut dead = DenseBitSet::new_empty(body.local_decls.len());
        let mut queue = WorkQueue::new_in(body.local_decls.len(), &self.scratch);
        for (local, &count) in visitor.uses.iter_enumerated() {
            if count != 0 {
                continue;
            }

            dead.insert(local);
            queue.enqueue(local);
        }

        while let Some(local) = queue.dequeue() {
            for dependent in analysis.depends_on(local) {
                visitor.uses[dependent] -= 1;

                if visitor.uses[dependent] == 0 {
                    dead.insert(dependent);
                    queue.enqueue(dependent);
                }
            }
        }

        todo!()
    }
}

struct FindUseVisitor<A: Allocator> {
    uses: LocalVec<usize, A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for FindUseVisitor<A> {
    type Result = Result<(), !>;

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        if context.into_def_use() != Some(DefUse::Use) {
            return Ok(());
        }

        self.uses[local] += 1;
        Ok(())
    }
}
