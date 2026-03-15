// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use core::{alloc::Allocator, marker::PhantomData, ops::Deref, pin::pin};
use std::alloc::Global;

use futures_lite::StreamExt as _;
use hashql_core::heap::ScratchPool;
use hashql_mir::{
    body::{
        basic_block::BasicBlockId,
        terminator::{GraphRead, GraphReadBody},
    },
    def::{DefId, DefIdSlice},
    interpret::{
        CallStack, Inputs, Runtime, RuntimeConfig, RuntimeError, Yield,
        suspension::{Continuation, GraphReadSuspension, Suspension},
        value::{self, Value},
    },
    pass::execution::TargetId,
};
use tokio::task::LocalSet;
use tokio_postgres::{Client, Row};

use self::{
    codec::{decode::Decoder, encode::encode_parameter_in},
    error::BridgeError,
    partial::Partial,
    postgres::PartialPostgresState,
    request::GraphReadOrchestrator,
    tail::Tail,
};
use crate::{
    context::EvalContext,
    postgres::{ColumnDescriptor, PreparedQuery},
};

mod codec;
pub(crate) mod error;
mod partial;
mod postgres;
mod request;
mod tail;

struct PreparedQueries<'heap, A: Allocator> {
    offsets: Box<DefIdSlice<usize>, A>,
    queries: Vec<PreparedQuery<'heap, A>, A>,
}

impl<'heap, A: Allocator> PreparedQueries<'heap, A> {
    fn find(
        &self,
        body: DefId,
        block: BasicBlockId,
    ) -> Result<&PreparedQuery<'heap, A>, BridgeError<'heap>> {
        todo!("implement query lookup using offsets and queries")
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Indexed<T> {
    pub index: usize,
    value: T,
}

impl<T> Indexed<T> {
    pub fn new(index: usize, value: T) -> Self {
        Self { index, value }
    }
}

impl<T> Deref for Indexed<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}

struct Orchestrator<'env, 'ctx, 'heap, C, A: Allocator> {
    client: Client,
    queries: &'env PreparedQueries<'heap, A>,
    context: &'env EvalContext<'ctx, 'heap, A>,
    tasks: LocalSet,

    pool: ScratchPool,

    _marker: PhantomData<C>,
}

#[expect(clippy::future_not_send)]
impl<'ctx, 'heap, C, A: Allocator> Orchestrator<'_, 'ctx, 'heap, C, A> {
    async fn fulfill_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        callstack: &CallStack<'ctx, 'heap, L>,
        suspension: Suspension<'ctx, 'heap>,
        alloc: L,
    ) -> Result<Continuation<'ctx, 'heap, L>, RuntimeError<'heap, BridgeError<'heap>, L>> {
        match suspension {
            Suspension::GraphRead(suspension) => {
                GraphReadOrchestrator::new(self)
                    .fulfill_in(inputs, callstack, suspension, alloc)
                    .await
            }
        }
    }

    async fn fulfill(
        &self,
        inputs: &Inputs<'heap, Global>,
        callstack: &CallStack<'ctx, 'heap, Global>,
        suspension: Suspension<'ctx, 'heap>,
    ) -> Result<Continuation<'ctx, 'heap, Global>, RuntimeError<'heap, BridgeError<'heap>, Global>>
    {
        self.fulfill_in(inputs, callstack, suspension, Global).await
    }
}
