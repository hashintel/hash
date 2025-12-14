use core::alloc::Allocator;

use hashql_core::{
    collections::WorkQueue,
    heap::Scratch,
    id::{
        Id as _,
        bit_vec::{DenseBitSet, SparseBitMatrix},
    },
};

use crate::{
    body::{
        Body,
        local::{Local, LocalSlice, LocalVec},
        location::Location,
        place::{DefUse, PlaceContext},
        statement::Assign,
    },
    context::MirContext,
    pass::{AnalysisPass as _, TransformPass, analysis::DataDependencyAnalysis},
    visit::{self, Visitor},
};

pub struct DeadStatementElimination {
    scratch: Scratch,
}

impl<'env, 'heap> TransformPass<'env, 'heap> for DeadStatementElimination {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let mut dependencies = DependencyVisitor::new_in(&body.local_decls, &self.scratch);
        dependencies.visit_body(body);

        let mut dead = DenseBitSet::new_empty(body.local_decls.len());
        let mut queue = WorkQueue::new_in(body.local_decls.len(), &self.scratch);
        for (local, &count) in dependencies.uses.iter_enumerated() {
            if count != 0 {
                continue;
            }

            dead.insert(local);
            queue.enqueue(local);
        }

        while let Some(local) = queue.dequeue() {
            for dependent in dependencies.matrix.iter(local) {
                dependencies.uses[dependent] -= 1;

                if dependencies.uses[dependent] == 0 {
                    dead.insert(dependent);
                    queue.enqueue(dependent);
                }
            }
        }

        todo!()
    }
}

struct DependencyVisitor<A: Allocator> {
    matrix: SparseBitMatrix<Local, Local, A>,
    uses: LocalVec<usize, A>,
    current_def: Local,
}

impl<A: Allocator> DependencyVisitor<A> {
    fn new_in(domain: &LocalSlice<impl Sized>, alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            matrix: SparseBitMatrix::new_in(domain.len(), alloc.clone()),
            uses: LocalVec::from_domain_in(0, domain, alloc),
            current_def: Local::MAX,
        }
    }
}

impl<A: Allocator> Visitor<'_> for DependencyVisitor<A> {
    type Result = Result<(), !>;

    fn visit_statement_assign(&mut self, location: Location, assign: &Assign<'_>) -> Self::Result {
        Ok(()) = visit::r#ref::walk_statement_assign(self, location, assign);

        self.current_def = Local::MAX;
        Ok(())
    }

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        // TODO: increment by 1 for block param that receives effect
        let Some(def_use) = context.into_def_use() else {
            return Ok(());
        };

        match def_use {
            DefUse::Def => self.current_def = local,
            DefUse::PartialDef => unimplemented!("MIR must be in SSA"),
            DefUse::Use => {
                if self.current_def == Local::MAX {
                    // We're in a use that isn't part of a definition
                    return Ok(());
                }

                self.matrix.insert(self.current_def, local);
                self.uses[local] += 1;
            }
        }

        Ok(())
    }
}
