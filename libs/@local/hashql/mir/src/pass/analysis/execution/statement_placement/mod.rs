mod cost;
mod postgres;

use core::{iter, num::NonZero, ops::Index};
use std::alloc::{Allocator, Global};

use hashql_core::id::Id;

use self::cost::Cost;
use super::target::{ExecutionTarget, Interpreter, Postgres};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
        basic_blocks::BasicBlocks,
        location::Location,
        statement::Statement,
    },
    context::MirContext,
};

// TODO: Implement the StatementPlacementVisitor via Dataflow

pub trait StatementPlacementVisitor<'env, 'heap> {
    type Target: ExecutionTarget;
    type State<'ctx, A: Allocator>;

    fn target(&self) -> &Self::Target;

    fn initialize_state<'ctx, A: Allocator>(
        &self,
        context: &'ctx MirContext<'env, 'heap>,
        body: &Body<'heap>,
        alloc: A,
    ) -> Self::State<'ctx, A>;

    fn enter_basic_block<A: Allocator>(&self, id: BasicBlockId, state: &mut Self::State<'_, A>) {}
    fn leave_basic_block<A: Allocator>(&self, id: BasicBlockId, state: &mut Self::State<'_, A>) {}

    fn visit_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::State<'_, A>,
    ) -> Option<Cost>;
}

struct InterpreterVisitor;

impl<'env, 'heap> StatementPlacementVisitor<'env, 'heap> for InterpreterVisitor {
    type State<'ctx, A: Allocator> = ();
    type Target = Interpreter;

    fn target(&self) -> &Self::Target {
        &Interpreter
    }

    fn initialize_state<'ctx, A: Allocator>(
        &self,
        _: &'ctx MirContext<'env, 'heap>,
        _: &Body<'heap>,
        _: A,
    ) -> Self::State<'ctx, A> {
    }

    fn visit_statement<A: Allocator>(
        &self,
        _: Location,
        _: &Statement<'heap>,
        (): &mut Self::State<'_, A>,
    ) -> Option<Cost> {
        // By design, the interpreter must support any statement (but not terminator), to allow for
        // execution in case no other exists.
        // By default, the cost is a bit high, to encourage other strategies to be chosen.
        // Some(Cost::new(8))
        todo!()
    }
}

struct PostgresVisitor;

// The postgres visitor must make sure, that:
// 1) the value is representable
// 2) either through direct access of the vertex, or if data is either locally defined OR used
//    through a function. There may be some things that cannot be run, such as embeddings.
// 3) apply calls are *not* supported
// 4) Therefore we *must* have a list of items that are supported, then represent them, check if
//    they are part, if not, we must bail.
// 5) At this point we *do not* need to do alias analysis, which is nice.
// 6) depending on bitwise ops, these may or may not be supported.
// This must happen depending on the source, be it filter or whatever
impl<'env, 'heap> StatementPlacementVisitor<'env, 'heap> for PostgresVisitor {
    type State<'ctx, A: Allocator> = ();
    type Target = Postgres;

    fn target(&self) -> &Self::Target {
        &Postgres
    }

    fn initialize_state<'ctx, A: Allocator>(
        &self,
        context: &'ctx MirContext<'env, 'heap>,
        body: &Body<'heap>,
        alloc: A,
    ) -> Self::State<'ctx, A> {
        todo!()
    }

    fn visit_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::State<'_, A>,
    ) -> Option<Cost> {
        todo!()
    }
}
