use hashql_core::{heap, id::Id as _, span::SpanId};
use hashql_hir::node::{
    branch,
    graph::{self, Graph},
    kind::NodeKind,
};

use super::{
    Reifier,
    current::{CurrentBlock, Rewire},
    error::expected_closure_filter,
};
use crate::{
    body::{
        basic_block::BasicBlockId,
        local::Local,
        terminator::{
            Branch, GraphRead, GraphReadBody, GraphReadHead, GraphReadTail, Target, Terminator,
            TerminatorKind,
        },
    },
    def::DefId,
};

impl<'mir, 'heap> Reifier<'_, 'mir, '_, '_, 'heap> {
    fn terminator_graph_read_head(
        &mut self,
        head: graph::GraphReadHead<'heap>,
    ) -> GraphReadHead<'heap> {
        match head {
            graph::GraphReadHead::Entity { axis } => GraphReadHead::Entity {
                axis: self.operand(axis),
            },
        }
    }

    const fn terminator_graph_read_tail(tail: graph::GraphReadTail) -> GraphReadTail {
        match tail {
            graph::GraphReadTail::Collect => GraphReadTail::Collect,
        }
    }

    fn terminator_graph_read_body(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        body: graph::GraphReadBody<'heap>,
    ) -> GraphReadBody {
        match body {
            graph::GraphReadBody::Filter(filter) => {
                let NodeKind::Closure(closure) = filter.kind else {
                    self.state
                        .diagnostics
                        .push(expected_closure_filter(filter.span));

                    // Return a bogus value, so that lowering can continue
                    return GraphReadBody::Filter(DefId::MAX, Local::MAX);
                };

                let (ptr, env) = self.transform_closure(block, filter.span, closure);
                GraphReadBody::Filter(ptr, env)
            }
        }
    }

    fn terminator_graph_read_bodies(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        bodies: &[graph::GraphReadBody<'heap>],
    ) -> heap::Vec<'heap, GraphReadBody> {
        let mut result = heap::Vec::with_capacity_in(bodies.len(), self.context.heap);

        result.extend(
            bodies
                .iter()
                .map(|&body| self.terminator_graph_read_body(block, body)),
        );

        result
    }

    fn terminator_graph_read(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        destination: Local,
        span: SpanId,
        graph::GraphRead { head, body, tail }: graph::GraphRead<'heap>,
    ) {
        let head = self.terminator_graph_read_head(head);
        let body = self.terminator_graph_read_bodies(block, &body);
        let tail = Self::terminator_graph_read_tail(tail);

        let terminator = Terminator {
            span,
            kind: TerminatorKind::GraphRead(GraphRead {
                head,
                body,
                tail,
                target: BasicBlockId::PLACEHOLDER,
            }),
        };

        block.terminate(
            terminator,
            // Once finished, the prev block should point to the next block
            |prev| [Rewire::graph_read(prev)],
            &mut self.blocks,
        );

        // Change the new block to take a single argument, which is where to store the result
        block.replace_params(&[destination]);
    }

    pub(super) fn terminator_graph(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        destination: Local,
        span: SpanId,
        graph: Graph<'heap>,
    ) {
        match graph {
            Graph::Read(read) => self.terminator_graph_read(block, destination, span, read),
        }
    }

    pub(super) fn terminator_branch_if(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        destination: Local,
        span: SpanId,
        branch::If { test, then, r#else }: branch::If<'heap>,
    ) {
        let test = self.operand(test);

        let (then, then_operand) = self.transform_node(then);
        let (r#else, else_operand) = self.transform_node(r#else);

        // We now need to wire *both* to be goto to the next block, we target a placeholder block,
        // which is going to get instantiated on the next rewire.
        let then = then.finish_goto(
            then_operand.span,
            BasicBlockId::PLACEHOLDER,
            &[then_operand.value],
            &mut self.blocks,
        );
        let r#else = r#else.finish_goto(
            else_operand.span,
            BasicBlockId::PLACEHOLDER,
            &[else_operand.value],
            &mut self.blocks,
        );

        block.terminate(
            Terminator {
                span,
                kind: TerminatorKind::Branch(Branch {
                    test,
                    then: Target::block(then, self.context.interner),
                    r#else: Target::block(r#else, self.context.interner),
                }),
            },
            |_| [Rewire::goto(then), Rewire::goto(r#else)],
            &mut self.blocks,
        );

        // Change the new block to take a single argument, which is where to store the result
        block.replace_params(&[destination]);
    }

    pub(super) fn terminator_branch(
        &mut self,
        block: &mut CurrentBlock<'mir, 'heap>,
        destination: Local,
        span: SpanId,
        branch: branch::Branch<'heap>,
    ) {
        match branch {
            branch::Branch::If(r#if) => self.terminator_branch_if(block, destination, span, r#if),
        }
    }
}
