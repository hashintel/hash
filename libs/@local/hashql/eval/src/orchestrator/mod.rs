// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use alloc::alloc::Global;
use core::{alloc::Allocator, marker::PhantomData, ops::Deref};

use hashql_mir::{
    body::basic_block::BasicBlockId,
    def::{DefId, DefIdSlice},
    interpret::{
        CallStack, Inputs, Runtime, RuntimeConfig, RuntimeError,
        suspension::{Continuation, Suspension},
        value::Value,
    },
};
use tokio_postgres::Client;

use self::{error::BridgeError, request::GraphReadOrchestrator};
use crate::{context::EvalContext, postgres::PreparedQuery};

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
    pub(crate) const fn new(index: usize, value: T) -> Self {
        Self { index, value }
    }
}

impl<T> Deref for Indexed<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}

pub struct Orchestrator<'env, 'ctx, 'heap, C, A: Allocator> {
    client: Client,
    queries: &'env PreparedQueries<'heap, A>,
    context: &'env EvalContext<'ctx, 'heap, A>,

    _marker: PhantomData<C>,
}

#[expect(clippy::future_not_send)]
impl<'ctx, 'heap, C, A: Allocator> Orchestrator<'_, 'ctx, 'heap, C, A> {
    pub async fn run_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,

        body: DefId,
        args: impl IntoIterator<Item = Value<'heap, L>, IntoIter: ExactSizeIterator>,

        alloc: L,
    ) -> Result<Value<'heap, L>, RuntimeError<'heap, BridgeError<'heap>, L>> {
        let mut runtime = Runtime::new_in(
            RuntimeConfig::default(),
            self.context.bodies,
            inputs,
            alloc.clone(),
        );
        runtime.reset();

        let mut callstack = CallStack::new(&runtime, body, args);

        loop {
            let next = runtime.run_until_suspension(&mut callstack)?;
            match next {
                hashql_mir::interpret::Yield::Return(value) => {
                    return Ok(value);
                }
                hashql_mir::interpret::Yield::Suspension(suspension) => {
                    let continuation = self
                        .fulfill_in(inputs, &callstack, suspension, alloc.clone())
                        .await?;

                    continuation.apply(&mut callstack)?;
                }
            }
        }
    }

    pub async fn fulfill_in<L: Allocator + Clone>(
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

    pub async fn fulfill(
        &self,
        inputs: &Inputs<'heap, Global>,
        callstack: &CallStack<'ctx, 'heap, Global>,
        suspension: Suspension<'ctx, 'heap>,
    ) -> Result<Continuation<'ctx, 'heap, Global>, RuntimeError<'heap, BridgeError<'heap>, Global>>
    {
        self.fulfill_in(inputs, callstack, suspension, Global).await
    }
}
