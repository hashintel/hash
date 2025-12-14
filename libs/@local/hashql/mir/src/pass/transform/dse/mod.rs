use core::alloc::Allocator;

use hashql_core::{
    collections::WorkQueue,
    graph::{LinkedGraph, NodeId},
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
        terminator::Target,
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
        let mut dependencies = DependencyVisitor::new_in(&body, &self.scratch);
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
            for edge in dependencies
                .graph
                .outgoing_edges(NodeId::new(local.as_usize()))
            {
                let dependent = Local::new(edge.target().as_usize());

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

struct DependencyVisitor<'body, 'heap, A: Allocator> {
    body: &'body Body<'heap>,
    graph: LinkedGraph<(), (), A>,
    uses: LocalVec<usize, A>,
    current_def: Local,
}

impl<'body, 'heap, A: Allocator> DependencyVisitor<'body, 'heap, A> {
    fn new_in(body: &'body Body<'heap>, alloc: A) -> Self
    where
        A: Clone,
    {
        let mut graph = LinkedGraph::new_in(alloc.clone());
        graph.derive(&body.local_decls, |_, _| ());

        Self {
            body,
            graph,
            uses: LocalVec::from_domain_in(0, &body.local_decls, alloc),
            current_def: Local::MAX,
        }
    }
}

impl<'heap, A: Allocator> Visitor<'heap> for DependencyVisitor<'_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &Assign<'heap>,
    ) -> Self::Result {
        Ok(()) = visit::r#ref::walk_statement_assign(self, location, assign);

        self.current_def = Local::MAX;
        Ok(())
    }

    fn visit_target(&mut self, location: Location, target: &Target<'heap>) -> Self::Result {
        // We don't walk the target to avoid double counting.
        let target_block = &self.body.basic_blocks[target.block];
        let params = &target_block.params;
        debug_assert_eq!(params.len(), target.args.len());

        for (&param, arg) in params.iter().zip(target.args) {
            self.current_def = param;
            Ok(()) = self.visit_operand(location, arg);
        }

        self.current_def = Local::MAX;
        Ok(())
    }

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        let Some(def_use) = context.into_def_use() else {
            return Ok(());
        };

        match def_use {
            DefUse::Def => self.current_def = local,
            DefUse::PartialDef => unimplemented!("MIR must be in SSA"),
            DefUse::Use => {
                if self.current_def != Local::MAX {
                    self.graph.add_edge(
                        NodeId::new(self.current_def.as_usize()),
                        NodeId::new(local.as_usize()),
                        (),
                    );
                }

                self.uses[local] += 1;
            }
        }

        Ok(())
    }
}
