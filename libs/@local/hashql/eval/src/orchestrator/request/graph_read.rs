//! Orchestrator for [`GraphRead`] suspensions.
//!
//! A [`GraphRead`] suspension is the interpreter's request to load vertices
//! from the graph store. The [`GraphReadOrchestrator`] resolves it by:
//!
//! 1. Looking up the pre-compiled SQL query for the suspension's `(body, block)` pair.
//! 2. Encoding the query parameters from the interpreter's current state.
//! 3. Executing the query against PostgreSQL and streaming rows.
//! 4. For each row: hydrating flat columns into a nested vertex [`Value`], decoding any
//!    continuation state, running client-side filter chains (which may themselves involve
//!    interpreter and postgres interleaving), and accumulating accepted values via a [`Tail`]
//!    strategy.
//! 5. Packaging the collected output into a [`Continuation`] for the interpreter to resume with.
//!
//! [`GraphRead`]: hashql_mir::body::terminator::GraphRead
//! [`Value`]: hashql_mir::interpret::value::Value
//! [`Continuation`]: hashql_mir::interpret::suspension::Continuation
//! [`Tail`]: super::super::tail::Tail

use core::{alloc::Allocator, pin::pin};

use futures_lite::StreamExt as _;
use hashql_mir::{
    body::terminator::{GraphRead, GraphReadBody},
    def::DefId,
    interpret::{
        CallStack, Inputs, Runtime, RuntimeConfig, RuntimeError, Yield,
        suspension::{Continuation, GraphReadSuspension},
        value::Value,
    },
    pass::execution::TargetId,
};
use tokio_postgres::{Client, Row};

use crate::{
    orchestrator::{
        Indexed, Orchestrator,
        codec::{decode::Decoder, encode::encode_parameter_in},
        error::BridgeError,
        events::{Event, EventLog},
        partial::Partial,
        postgres::{PartialPostgresState, PostgresState},
        tail::Tail,
    },
    postgres::{ColumnDescriptor, PreparedQuery},
};

type PartialState<'heap, L> = (Partial<'heap, L>, Vec<PartialPostgresState<L>, L>);
type State<'heap, L> = (Value<'heap, L>, Vec<PostgresState<'heap, L>, L>);

/// Handler for [`GraphRead`] suspensions.
///
/// Borrows the parent [`Orchestrator`] for access to the database client,
/// query registry, and evaluation context. All work happens through
/// [`fulfill_in`](Self::fulfill_in), which drives the full pipeline from
/// query execution through row hydration, filtering, and result collection.
///
/// [`GraphRead`]: hashql_mir::body::terminator::GraphRead
/// [`Orchestrator`]: super::super::Orchestrator
pub(crate) struct GraphReadOrchestrator<'or, 'ctx, 'env, 'heap, C, E, A: Allocator> {
    inner: &'or Orchestrator<'ctx, 'env, 'heap, C, E, A>,
}

#[expect(clippy::future_not_send)]
impl<'or, 'ctx, 'env, 'heap, C: AsRef<Client>, E: EventLog, A: Allocator>
    GraphReadOrchestrator<'or, 'ctx, 'env, 'heap, C, E, A>
{
    pub(crate) const fn new(orchestrator: &'or Orchestrator<'ctx, 'env, 'heap, C, E, A>) -> Self {
        Self {
            inner: orchestrator,
        }
    }

    fn postgres_hydrate_in<L: Allocator + Clone>(
        &self,
        decoder: &Decoder<'ctx, 'heap, L>,

        query: &PreparedQuery<'_, impl Allocator>,
        row: &Row,

        alloc: L,
    ) -> Result<PartialState<'heap, L>, RuntimeError<'heap, BridgeError<'heap>, L>> {
        let mut partial = Partial::new(query.vertex_type);
        let mut partial_states = Vec::new_in(alloc.clone());

        for (index, &column) in query.columns.iter().enumerate() {
            match column {
                ColumnDescriptor::Path { path, r#type } => {
                    partial
                        .hydrate_from_postgres(
                            self.inner.context.env,
                            decoder,
                            path,
                            r#type,
                            Indexed::new(index, column),
                            row,
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
                    let state = if let Some(state) = partial_states.iter_mut().find(
                        |interpreter: &&mut PartialPostgresState<_>| {
                            interpreter.body == body && interpreter.island == island
                        },
                    ) {
                        state
                    } else {
                        partial_states.push_mut(PartialPostgresState::new(body, island))
                    };

                    state
                        .hydrate(Indexed::new(index, column), field, row, alloc.clone())
                        .map_err(RuntimeError::Suspension)?;
                }
            }
        }

        Ok((partial, partial_states))
    }

    fn finish_in<L: Allocator + Clone>(
        &self,

        decoder: &Decoder<'ctx, 'heap, L>,

        partial: Partial<'heap, L>,
        partial_states: Vec<PartialPostgresState<L>, L>,

        alloc: L,
    ) -> Result<State<'heap, L>, RuntimeError<'heap, BridgeError<'heap>, L>> {
        let mut states = Vec::with_capacity_in(partial_states.len(), alloc.clone());

        for state in partial_states {
            let body = &self.inner.context.bodies[state.body];

            let state = state
                .finish_in(decoder, body, alloc.clone())
                .map_err(RuntimeError::Suspension)?;

            if let Some(state) = state {
                states.push(state);
            }
        }

        let entity = partial.finish_in(self.inner.context.interner, alloc);

        Ok((entity, states))
    }

    #[expect(clippy::too_many_arguments)]
    async fn process_row_filter_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,

        runtime: &mut Runtime<'ctx, 'heap, L>,
        states: &[PostgresState<'heap, L>],

        body: DefId,

        entity: &Value<'heap, L>,
        env: &Value<'heap, L>,

        alloc: L,
    ) -> Result<bool, RuntimeError<'heap, BridgeError<'heap>, L>> {
        let residual = self.inner.context.execution.lookup(body).ok_or_else(|| {
            RuntimeError::Suspension(BridgeError::MissingExecutionResidual { body })
        })?;

        let Ok(mut callstack) = CallStack::new_in(
            &self.inner.context.bodies[body],
            [Ok::<_, !>(env.clone()), Ok(entity.clone())],
            alloc.clone(),
        );

        self.inner.event_log.log(Event::FilterStarted { body });

        let eval = 'eval: loop {
            let (island_id, island_node) = residual.islands.lookup(callstack.current_block()?);
            let target = island_node.target();

            self.inner.event_log.log(Event::IslandEntered {
                body,
                island: island_id,
                target,
            });

            match target {
                TargetId::Interpreter => {
                    loop {
                        let next = runtime.run_until_transition(&mut callstack, |target| {
                            residual.islands.lookup(target).0 == island_id
                        })?;

                        match next {
                            core::ops::ControlFlow::Continue(Yield::Return(value)) => {
                                let Value::Integer(value) = value else {
                                    return Err(RuntimeError::Suspension(
                                        BridgeError::InvalidFilterReturn { body },
                                    ));
                                };

                                let Some(value) = value.as_bool() else {
                                    return Err(RuntimeError::Suspension(
                                        BridgeError::InvalidFilterReturn { body },
                                    ));
                                };

                                break 'eval value;
                            }
                            core::ops::ControlFlow::Continue(Yield::Suspension(suspension)) => {
                                let continuation = Box::pin(self.inner.fulfill_in(
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
                    // 1. The value is NULL, meaning that the filter has already been fully
                    //    evaluated in the postgres query
                    // 2. The value is not NULL, which means that we need to continue evaluation of
                    //    the filter body.
                    let Some(state) = states
                        .iter()
                        .find(|state| state.body == body && state.island == island_id)
                    else {
                        // This is the implicit value, in case that the where clause
                        // upstream has been evaluated. If the postgres query has
                        // produced a value, it must mean that the condition must've
                        // been true.
                        self.inner
                            .event_log
                            .log(Event::ContinuationImplicitTrue { body });
                        break 'eval true;
                    };

                    // We must not flush the locals of the body to the values that have
                    // been captured, and advance the pointer.
                    state.flush(&mut callstack)?;
                    self.inner.event_log.log(Event::ContinuationFlushed {
                        body,
                        island: island_id,
                    });
                }
                TargetId::Embedding => {
                    // TODO: in the future this may benefit from a dispatch barrier, the
                    // idea that we wait for sufficient embedding calls to the same
                    // island to dispatch. Must be smaller than the buffer size.
                    unimplemented!()
                }
            }
        };

        Ok(eval)
    }

    async fn process_row_transform_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        parent: &CallStack<'ctx, 'heap, L>,

        states: &[PostgresState<'heap, L>],

        entity: Value<'heap, L>,

        read: &GraphRead<'heap>,

        alloc: L,
    ) -> Result<Option<Value<'heap, L>>, RuntimeError<'heap, BridgeError<'heap>, L>> {
        let mut runtime = Runtime::new_in(
            RuntimeConfig::default(),
            self.inner.context.bodies,
            inputs,
            alloc.clone(),
        );

        for body in &read.body {
            match body {
                &GraphReadBody::Filter(body, env) => {
                    let env = parent.locals()?.local(env)?;

                    runtime.reset();
                    let result = self
                        .process_row_filter_in(
                            inputs,
                            &mut runtime,
                            states,
                            body,
                            &entity,
                            env,
                            alloc.clone(),
                        )
                        .await?;

                    // Filters are short circuiting and act as `&&`, meaning if one is false, all
                    // are.
                    if result {
                        self.inner.event_log.log(Event::FilterAccepted { body });
                    } else {
                        self.inner.event_log.log(Event::FilterRejected { body });
                        return Ok(None);
                    }
                }
            }
        }

        Ok(Some(entity))
    }

    async fn process_row_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        parent: &CallStack<'ctx, 'heap, L>,

        read: &GraphRead<'heap>,
        query: &PreparedQuery<'heap, impl Allocator>,

        row: Row,

        alloc: L,
    ) -> Result<Option<Value<'heap, L>>, RuntimeError<'heap, BridgeError<'heap>, L>> {
        let decoder = Decoder::new(
            self.inner.context.env,
            self.inner.context.interner,
            alloc.clone(),
        );

        let (partial, partial_states) =
            self.postgres_hydrate_in(&decoder, query, &row, alloc.clone())?;

        let (entity, states) = self.finish_in(&decoder, partial, partial_states, alloc.clone())?;

        // Now that we have the completed states, it's time to fulfill the graph read, by running
        // everything through the filter chain.
        // This is sequential in nature, because in the future filters may depend on the mapped
        // value. The parallelisation opportunity of sequential filters isn't applicable here,
        // instead that should be done inside either the HIR or MIR.
        self.process_row_transform_in(inputs, parent, &states, entity, read, alloc)
            .await
    }

    // The entrypoint for graph read operations. The entrypoint is *always* postgres, because that's
    // the primary data store.
    pub(crate) async fn fulfill_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        callstack: &CallStack<'ctx, 'heap, L>,
        suspension @ GraphReadSuspension {
            body,
            block,
            read,
            axis: _,
        }: GraphReadSuspension<'env, 'heap>,
        alloc: L,
    ) -> Result<Continuation<'env, 'heap, L>, RuntimeError<'heap, BridgeError<'heap>, L>> {
        // Because postgres is our source of truth, it means that any graph read suspension must be
        // resolved by querying postgres first.
        let query =
            self.inner.queries.find(body, block).ok_or_else(|| {
                RuntimeError::Suspension(BridgeError::QueryLookup { body, block })
            })?;
        let statement = query.transpile().to_string();

        let locals = callstack.locals().map_err(RuntimeError::widen)?;
        let mut params = Vec::with_capacity_in(query.parameters.len(), alloc.clone());
        for param in query.parameters.iter().map(|parameter| {
            encode_parameter_in(
                parameter,
                inputs,
                &suspension.axis,
                |local, field| {
                    let value = locals.local(local)?;
                    value.project(field)
                },
                alloc.clone(),
            )
        }) {
            params.push(param?);
        }

        self.inner
            .event_log
            .log(Event::QueryExecuted { body, block });

        // The actual data and entities that we need to take a look at.
        let response = self
            .inner
            .client
            .as_ref()
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

            self.inner.event_log.log(Event::RowReceived);

            let item = self
                .process_row_in(inputs, callstack, read, query, row, alloc.clone())
                .await?;

            if let Some(item) = item {
                self.inner.event_log.log(Event::RowAccepted);
                output.push(item);
            } else {
                self.inner.event_log.log(Event::RowRejected);
            }
        }

        let output = output.finish();
        Ok(suspension.resolve(output))
    }
}
