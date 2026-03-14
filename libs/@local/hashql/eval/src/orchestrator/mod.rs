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
mod tail;

struct PreparedQueries<'heap, A: Allocator> {
    offsets: Box<DefIdSlice<usize>, A>,
    queries: Vec<PreparedQuery<'heap, A>, A>,
}

impl<'heap, A: Allocator> PreparedQueries<'heap, A> {
    fn find(&self, body: DefId, block: BasicBlockId) -> &PreparedQuery<'heap, A> {
        todo!()
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
    #[expect(clippy::too_many_lines)]
    async fn graph_read_row_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        parent: &CallStack<'ctx, 'heap, L>,

        read: &GraphRead<'heap>,
        query: &PreparedQuery<'_, impl Allocator>,

        row: Row,

        alloc: L,
    ) -> Result<Option<Value<'heap, L>>, RuntimeError<'heap, BridgeError, L>> {
        let mut partial = Partial::new(query.vertex_type);
        let decoder = Decoder::new(self.context.env, self.context.interner, alloc.clone());
        let mut states = Vec::new_in(alloc.clone());

        for (index, &column) in query.columns.iter().enumerate() {
            match column {
                ColumnDescriptor::Path { path, r#type } => {
                    partial
                        .hydrate_from_postgres(
                            self.context.env,
                            &decoder,
                            path,
                            r#type,
                            Indexed::new(index, column),
                            &row,
                        )
                        .map_err(RuntimeError::Suspension)?;
                }
                ColumnDescriptor::Continuation {
                    body,
                    island,
                    field,
                } => {
                    #[expect(
                        clippy::option_if_let_else,
                        reason = "this is required for borrowing because we borrow and push to \
                                  states"
                    )]
                    let state = if let Some(state) =
                        states
                            .iter_mut()
                            .find(|interpreter: &&mut PartialPostgresState<_>| {
                                interpreter.body == body && interpreter.island == island
                            }) {
                        state
                    } else {
                        states.push_mut(PartialPostgresState::new(body, island))
                    };

                    state
                        .hydrate(Indexed::new(index, column), field, &row, alloc.clone())
                        .map_err(RuntimeError::Suspension)?;
                }
            }
        }

        let decoder = Decoder::new(self.context.env, self.context.interner, alloc.clone());
        let mut completed = Vec::with_capacity_in(states.len(), alloc.clone());
        for state in states {
            let body = &self.context.bodies[state.body];
            let state = state
                .finish_in(&decoder, body, alloc.clone())
                .map_err(RuntimeError::Suspension)?;

            if let Some(state) = state {
                completed.push(state);
            }
        }

        let mut runtime = Runtime::new_in(
            RuntimeConfig::default(),
            self.context.bodies,
            inputs,
            alloc.clone(),
        );

        let entity = partial.finish_in(self.context.interner, alloc.clone());

        // Now that we have the completed states, it's time to fulfill the graph read, by running
        // everything through the filter chain.
        // This is sequential in nature, because in the future filters may depend on the mapped
        // value. The parallelisation opportunity of sequential filters isn't applicable here,
        // instead that should be done inside either the HIR or MIR.
        for body in &read.body {
            match body {
                &GraphReadBody::Filter(def_id, env) => {
                    let residual = self
                        .context
                        .execution
                        .lookup(def_id)
                        .unwrap_or_else(|| unreachable!("this should probably be an ICE"));

                    let env = parent.locals()?.local(env)?;

                    let Ok(mut callstack) = CallStack::new_in(
                        &self.context.bodies[def_id],
                        [Ok::<_, !>(env.clone()), Ok(entity.clone())],
                        alloc.clone(),
                    );

                    let eval = 'eval: loop {
                        let (island_id, island_node) =
                            residual.islands.lookup(callstack.current_block()?);

                        match island_node.target() {
                            TargetId::Interpreter => {
                                loop {
                                    let next = runtime
                                        .run_until_transition(&mut callstack, |target| {
                                            residual.islands.lookup(target).0 != island_id
                                        })?;

                                    match next {
                                        core::ops::ControlFlow::Continue(Yield::Return(value)) => {
                                            let Value::Integer(value) = value else {
                                                unreachable!("TODO: issue ICE");
                                            };

                                            let Some(value) = value.as_bool() else {
                                                unreachable!("TODO: issue ICE");
                                            };

                                            break 'eval value;
                                        }
                                        core::ops::ControlFlow::Continue(Yield::Suspension(
                                            suspension,
                                        )) => {
                                            let continuation = Box::pin(self.fulfill_in(
                                                inputs,
                                                &callstack,
                                                suspension,
                                                alloc.clone(),
                                            ))
                                            .await?;

                                            continuation.apply(&mut callstack)?;
                                        }
                                        core::ops::ControlFlow::Break(_) => {
                                            // We're finished, this means, and the next island is
                                            // up. To determine the next island we simply break.
                                            break;
                                        }
                                    }
                                }
                            }
                            TargetId::Postgres => {
                                // Postgres is special, because we hoist any computation directly
                                // into the initial query.
                                // There can be two different cases here:
                                // 1. The value is NULL, meaning that the filter has already been
                                //    fully evaluated in the postgres query
                                // 2. The value is not NULL, which means that we need to continue
                                //    evaluation of the filter body.
                                let Some(state) = completed.iter().find(|state| {
                                    state.body == def_id && state.island == island_id
                                }) else {
                                    // This is the implicit value, in case that the where clause
                                    // upstream has been evaluated. If the postgres query has
                                    // produced a value, it must mean that the condition must've
                                    // been true.
                                    break 'eval true;
                                };

                                // We must not flush the locals of the body to the values that have
                                // been captured, and advance the pointer.
                                state.flush(&mut callstack)?;
                            }
                            TargetId::Embedding => {
                                // TODO: in the future this may benefit from a dispatch barrier, the
                                // idea that we wait for sufficient embedding calls to the same
                                // island to dispatch. Must be smaller than the buffer size.
                                unimplemented!()
                            }
                        }
                    };

                    // Filters are short circuiting and act as `&&`, meaning if one is false, all
                    // are.
                    if !eval {
                        return Ok(None);
                    }
                }
            }
        }

        Ok(Some(entity))
    }

    // The entrypoint for graph read operations. The entrypoint is *always* postgres, because that's
    // the primary data store.
    async fn graph_read_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        callstack: &CallStack<'ctx, 'heap, L>,
        GraphReadSuspension {
            body,
            block,
            read,
            axis,
        }: &GraphReadSuspension<'ctx, 'heap>,
        alloc: L,
    ) -> Result<Value<'heap, L>, RuntimeError<'heap, BridgeError, L>> {
        // Each graph read has a corresponding query, this query is *always* located in postgres, if
        // only to try to get the entities that have been affected.
        // TODO: we must actually ensure that
        let query = self.queries.find(*body, *block);
        let statement = query.transpile().to_string();

        let locals = callstack.locals().map_err(RuntimeError::widen)?;
        let mut params = Vec::with_capacity_in(query.parameters.len(), alloc.clone());
        for param in query.parameters.iter().map(|parameter| {
            encode_parameter_in(
                parameter,
                inputs,
                axis,
                |local, field| {
                    let value = locals.local(local)?;
                    value.project(field)
                },
                alloc.clone(),
            )
        }) {
            params.push(param?);
        }

        // The actual data and entities that we need to take a look at.
        let response = self
            .client
            .query_raw(&statement, params.iter().map(|param| &**param))
            .await
            .map_err(|source| BridgeError::QueryExecution {
                sql: statement.clone(),
                source,
            })
            .map_err(RuntimeError::Suspension)?;

        let mut response = pin!(response);

        // TODO: parallelisation opportunity
        let mut output = Tail::new(read.tail);
        while let Some(row) = response.next().await {
            let row = row
                .map_err(|error| BridgeError::QueryExecution {
                    sql: statement.clone(),
                    source: error,
                })
                .map_err(RuntimeError::Suspension)?;

            let item = self
                .graph_read_row_in(inputs, callstack, read, query, row, alloc.clone())
                .await?;

            if let Some(item) = item {
                output.push(item);
            }
        }

        Ok(output.finish())
    }

    async fn fulfill_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        callstack: &CallStack<'ctx, 'heap, L>,
        suspension: Suspension<'ctx, 'heap>,
        alloc: L,
    ) -> Result<Continuation<'ctx, 'heap, L>, RuntimeError<'heap, BridgeError, L>> {
        match suspension {
            Suspension::GraphRead(graph_read_suspension) => {
                let output = self
                    .graph_read_in(inputs, callstack, &graph_read_suspension, alloc)
                    .await?;

                Ok(graph_read_suspension.resolve(output))
            }
        }
    }

    async fn fulfill(
        &self,
        inputs: &Inputs<'heap, Global>,
        callstack: &CallStack<'ctx, 'heap, Global>,
        suspension: Suspension<'ctx, 'heap>,
    ) -> Result<Continuation<'ctx, 'heap, Global>, RuntimeError<'heap, BridgeError, Global>> {
        self.fulfill_in(inputs, callstack, suspension, Global).await
    }
}
