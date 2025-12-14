use core::{alloc::Allocator, convert::Infallible};

use hashql_core::{
    collections::WorkQueue,
    graph::{LinkedGraph, NodeId},
    heap::Scratch,
    id::{Id as _, bit_vec::DenseBitSet},
    intern::Interned,
};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockVec},
        local::Local,
        location::Location,
        operand::Operand,
        place::{DefUse, PlaceContext},
        statement::{Assign, Statement, StatementKind},
        terminator::{GraphRead, Target},
    },
    context::MirContext,
    intern::Interner,
    pass::TransformPass,
    visit::{self, Visitor, VisitorMut, r#mut::filter},
};

pub struct DeadStoreElimination {
    scratch: Scratch,
}

impl DeadStoreElimination {
    fn dead_locals(&self, body: &Body<'_>) -> DenseBitSet<Local> {
        let mut dependencies = DependencyVisitor::new_in(body, &self.scratch);
        dependencies.visit_body(body);

        let DependencyVisitor {
            body: _,
            graph,
            mut live,
            roots: mut queue,
            current_def: _,
        } = dependencies;

        while let Some(local) = queue.dequeue() {
            for edge in graph.outgoing_edges(NodeId::new(local.as_usize())) {
                let dependency = Local::new(edge.target().as_usize());
                if live.insert(dependency) {
                    queue.enqueue(dependency);
                }
            }
        }

        live.negate();
        live
    }
}

impl<'env, 'heap> TransformPass<'env, 'heap> for DeadStoreElimination {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let dead = self.dead_locals(body);
        let mut visitor = EliminationVisitor {
            dead,
            params: BasicBlockVec::from_fn_in(
                body.basic_blocks.len(),
                |block| body.basic_blocks[block].params,
                &self.scratch,
            ),
            interner: context.interner,
            scratch_locals: Vec::new_in(&self.scratch),
            scratch_operands: Vec::new_in(&self.scratch),
        };

        Ok(()) = visitor.visit_body_preserving_cfg(body);

        drop(visitor);
        self.scratch.reset();
    }
}

struct DependencyVisitor<'body, 'heap, A: Allocator> {
    body: &'body Body<'heap>,
    graph: LinkedGraph<(), (), A>,

    live: DenseBitSet<Local>,
    roots: WorkQueue<Local, A>,

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

            live: DenseBitSet::new_empty(body.local_decls.len()),
            roots: WorkQueue::new_in(body.local_decls.len(), alloc),

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
                if self.current_def == Local::MAX {
                    // We have a use of a local that is considered a root, a root is any local that
                    // is used inside of a terminator that isn't directly part of a target, such as
                    // a condition or return value.
                    self.roots.enqueue(local);
                    self.live.insert(local);
                } else {
                    // The edge is considered a dataflow edge, meaning we have a variable that flows
                    // into another.
                    self.graph.add_edge(
                        NodeId::new(self.current_def.as_usize()),
                        NodeId::new(local.as_usize()),
                        (),
                    );
                }
            }
        }

        Ok(())
    }

    fn visit_terminator_graph_read(
        &mut self,
        location: Location,
        graph_read: &GraphRead<'heap>,
    ) -> Self::Result {
        Ok(()) = visit::r#ref::walk_terminator_graph_read(self, location, graph_read);

        // Important: the actual block param of the graph read is static and *cannot* easily be
        // eliminated. To be eliminated we would need to eliminate the graph effect, which wouldn't
        // be safe, because that's an actual side effect.
        let target_block = &self.body.basic_blocks[graph_read.target];
        debug_assert_eq!(target_block.params.len(), 1);

        let param = target_block.params[0];

        // We do this by marking it as a root use
        self.roots.enqueue(param);
        self.live.insert(param);
        Ok(())
    }
}

struct EliminationVisitor<'env, 'heap, A: Allocator> {
    dead: DenseBitSet<Local>,
    params: BasicBlockVec<Interned<'heap, [Local]>, A>,
    interner: &'env Interner<'heap>,
    scratch_locals: Vec<Local, A>,
    scratch_operands: Vec<Operand<'heap>, A>,
}

impl<'heap, A: Allocator> VisitorMut<'heap> for EliminationVisitor<'_, 'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_basic_block(
        &mut self,
        id: BasicBlockId,
        block: &mut BasicBlock<'heap>,
    ) -> Self::Result<()> {
        Ok(()) = visit::r#mut::walk_basic_block(self, id, block);

        // Remove any no-ops
        block
            .statements
            .retain(|statement| !matches!(statement.kind, StatementKind::Nop));

        // Remove any params that are dead
        if block.params.iter().any(|&param| self.dead.contains(param)) {
            self.scratch_locals.clear();
            self.scratch_locals.extend_from_slice(&block.params);
            self.scratch_locals
                .retain(|&param| !self.dead.contains(param));

            block.params = self.interner.locals.intern_slice(&self.scratch_locals);
        }

        Ok(())
    }

    fn visit_statement(
        &mut self,
        _: Location,
        statement: &mut Statement<'heap>,
    ) -> Self::Result<()> {
        let local = match &statement.kind {
            StatementKind::Assign(assign) => assign.lhs.local,
            &StatementKind::StorageLive(local) | &StatementKind::StorageDead(local) => local,
            StatementKind::Nop => return Ok(()),
        };

        if self.dead.contains(local) {
            statement.kind = StatementKind::Nop;
        }

        Ok(())
    }

    fn visit_target(&mut self, _: Location, target: &mut Target<'heap>) -> Self::Result<()> {
        let target_params = self.params[target.block];
        debug_assert_eq!(target_params.len(), target.args.len());

        // Check if there are even any params which we need to remove, if not, then we can skip this
        // target
        if !target_params.iter().any(|&param| self.dead.contains(param)) {
            return Ok(());
        }

        self.scratch_operands.clear();
        self.scratch_operands.extend_from_slice(&target.args);

        let mut index = 0;
        self.scratch_operands.retain(|_| {
            let should_retain = !self.dead.contains(target_params[index]);
            index += 1;

            should_retain
        });
        let operands = self.interner.operands.intern_slice(&self.scratch_operands);

        target.args = operands;

        Ok(())
    }
}
