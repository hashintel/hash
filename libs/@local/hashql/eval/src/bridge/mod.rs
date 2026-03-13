// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use core::{alloc::Allocator, marker::PhantomData, ops::Deref, pin::pin};

use futures_lite::StreamExt as _;
use hashql_core::{
    collections::FastHashMap,
    heap::{BumpAllocator, ResetAllocator as _, Scratch},
    symbol::Symbol,
};
use hashql_mir::{
    body::{
        Body,
        basic_block::BasicBlockId,
        terminator::{GraphRead, GraphReadBody},
    },
    def::{DefId, DefIdSlice},
    interpret::{
        CallStack, Runtime, RuntimeConfig, RuntimeError, suspension::GraphReadSuspension,
        value::Value,
    },
    pass::execution::TargetId,
};
use postgres_types::ToSql;
use tokio_postgres::{Client, Row};

use self::{
    codec::{decode::Decoder, encode::encode_parameter_in},
    error::BridgeError,
    partial::Partial,
    postgres::PartialPostgresState,
    subinterpreter::PartialSubinterpreter,
};
use crate::{
    context::EvalContext,
    postgres::{ColumnDescriptor, PreparedQuery},
};

mod codec;
pub(crate) mod error;
mod partial;
mod postgres;
mod subinterpreter;

pub(crate) struct Inputs<'heap, A: Allocator> {
    pub(crate) inner: FastHashMap<Symbol<'heap>, Value<'heap, A>, A>,
}

impl<'heap, A: Allocator> Inputs<'heap, A> {
    pub(crate) fn get(&self, symbol: Symbol<'heap>) -> Option<&Value<'heap, A>> {
        self.inner.get(&symbol)
    }
}

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

struct Bridge<'env, 'ctx, 'heap, C, A: Allocator> {
    // TODO: the context and the input allocator must be different!
    client: Client,
    queries: &'env PreparedQueries<'heap, A>,
    context: &'env EvalContext<'ctx, 'heap, A>,

    _marker: PhantomData<C>,
}

impl<'ctx, 'heap, C, A: Allocator> Bridge<'_, 'ctx, 'heap, C, A> {
    async fn graph_read_row_in<L: BumpAllocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        parent: &CallStack<'ctx, 'heap, L>,

        read: &GraphRead<'heap>,
        query: &PreparedQuery<'_, impl Allocator>,

        row: Row,

        alloc: L,
    ) -> Result<(), RuntimeError<'heap, BridgeError, L>> {
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
                    // Find if we already have a subinterpreter for this island
                    let state =
                        {
                            if let Some(interpreter) = states.iter_mut().find(
                                |interpreter: &&mut PartialPostgresState<_>| {
                                    interpreter.body == body && interpreter.island == island
                                },
                            ) {
                                interpreter
                            } else {
                                states.push_mut(PartialPostgresState::new(body, island))
                            }
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
            &inputs.inner,
            alloc.clone(),
        );
        let entity = partial.finish_in(self.context.interner, alloc.clone());

        // Now that we have the completed states, it's time to fulfill the graph read, by running
        // everything through the filter chain.
        // This is sequential in nature, because in the future filters may depend on the mapped
        // value. The parallelisation opportunity of sequential filters isn't applicable here,
        // instead that should be done inside either the HIR or MIR.
        // TODO: implement consecutive filter fusing
        // TODO: we must find all the data islands and fulfill them
        for body in &read.body {
            match body {
                &GraphReadBody::Filter(def_id, env) => {
                    // TODO: we should probably *scope* here / reset / checkpoint
                    let checkpoint = alloc.checkpoint();

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

                    loop {
                        let (island_id, island_node) =
                            residual.islands.lookup(callstack.current_block()?);

                        match island_node.target() {
                            TargetId::Interpreter => {
                                // TODO: this must actually be implemented AND must only do it on
                                // the last frame, no mid-way suspension here amigo.
                                runtime.run_until(|target| {
                                    residual.islands.lookup(target).0 != island_id
                                });

                                // TODO: if we have a continuation here? just put it in a task, and
                                // pick it up by the parent runner.
                                // That way we can also just recycle memory easily, and have no
                                // nested BS.
                                // Nah we can just call ourselves, because of &self.

                                // TODO: if return value, then we need to filter depending on it.
                            }
                            TargetId::Postgres => {
                                // We must check if the postgres state exists, if it doesn't then we
                                // have a problem, why?
                                // Well... wouldn't you like to know weather boy.
                                // The issue pertains to the fact that it should've already been
                                // evaluated, which means that we should've never reached this
                                // specific state.
                                let Some(state) = completed.iter().find(|state| {
                                    state.body == def_id && state.island == island_id
                                }) else {
                                    // This means that the block has already been evaluated before,
                                    // which in turns means that we can just skip this filter body.
                                    // TODO: this must BREAK and set it to TRUE to be skipped. It
                                    // cannot continue the filter loop, because of the checkpoint.
                                    continue;
                                };

                                // We must not flush the locals of the body to the values that have
                                // been captured, and advance the pointer.
                                state.flush(&mut callstack);
                            }
                            TargetId::Embedding => {
                                // TODO: in the future this may benefit from a dispatch barrier, the
                                // idea that we wait for sufficient embedding calls to the same
                                // island to dispatch. Must be smaller than the buffer size.
                                unimplemented!()
                            }
                        }
                    }

                    // TODO: DROP MUST BE CALLED BEFORE THIS
                    // TODO: we must re-create the runtime if we want to rollback here, because we
                    // might have allocated memory that needs to be freed.
                    drop(callstack);

                    #[expect(unsafe_code)]
                    // SAFETY: None of the allocations made in this loop are shared with the
                    // caller, and none of the state is shared, so rolling back
                    // is safe.
                    unsafe {
                        alloc.rollback(checkpoint);
                    }

                    // The issue that we're running into is that here there are multiple ways we can
                    // continue. What do I mean by that? We **know** we must start at the
                    // `BasicBlock::START`, but there may be some data that we're relying on that
                    // isn't loaded yet. The fundamental tension is between data
                    // islands, that add new information and actual control flow.
                    // For control flow it's linear, but(!) data islands can be loaded in parallel
                    // at the beginning of execution, which we should do here.
                    // What does that mean? Good question! Before we run any filter we check all
                    // data nodes, aggregate them, and then dispatch them. Data nodes cannot have
                    // *any* dependencies (I mean how they just load data), but we need the entity
                    // directly to be able to fulfill them.
                    // We THEN merge them into the total entity, which we then materialize. YES YES
                    // YES YES.
                }
            }
        }

        todo!()
    }

    // The entrypoint for graph read operations. The entrypoint is *always* postgres, because that's
    // the primary data store.
    async fn graph_read_entry<L: Allocator + Clone>(
        &self,
        callstack: &CallStack<'ctx, 'heap, L>,
        GraphReadSuspension {
            body,
            block,
            read,
            axis,
        }: &GraphReadSuspension<'ctx, 'heap>,
    ) -> Result<(), RuntimeError<'heap, BridgeError, L>> {
        // Each graph read has a corresponding query, this query is *always* located in postgres, if
        // only to try to get the entities that have been affected.
        // TODO: we must actually ensure that
        let query = self.queries.find(*body, *block);
        let statement = query.transpile().to_string();

        let locals = callstack.locals().map_err(RuntimeError::widen)?;
        let mut params = Vec::with_capacity_in(query.parameters.len(), &self.scratch);
        for param in query.parameters.iter().map(|parameter| {
            encode_parameter_in(
                parameter,
                self.inputs,
                axis,
                |local, field| {
                    let value = locals.local(local)?;
                    value.project(field)
                },
                &self.scratch,
            )
        }) {
            params.push(param.map_err(RuntimeError::widen)?);
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
        while let Some(row) = response.next().await {
            let row = row
                .map_err(|error| BridgeError::QueryExecution {
                    sql: statement.clone(),
                    source: error,
                })
                .map_err(RuntimeError::Suspension)?;

            self.graph_read_row_in(read, callstack, row, query).await;
        }

        todo!()
    }

    async fn graph_read<L: Allocator + Clone>(
        &mut self,
        callstack: &CallStack<'_, 'heap, L>,
        suspension: &GraphReadSuspension<'_, 'heap>,
    ) -> Result<(), RuntimeError<'heap, BridgeError, L>> {
        self.scratch.reset();

        let axis = &suspension.axis;
        let locals = callstack.locals().map_err(RuntimeError::widen)?;
        let query = self.queries.find(suspension.body, suspension.block);

        // TODO: We must ensure that there's *always* a query, in case nothing is given we fallback
        // to a prepared one, that just fetches the data required.
        // We should either do this inside of the bridge computation, or when running the postgres
        // compiler. I am thinking the postgres compiler, where we just have a "nonsensical" output.
        let transpiled = query.transpile().to_string();
        let mut params = Vec::with_capacity_in(query.parameters.len(), &self.scratch);

        let encoded = query.parameters.iter().map(|parameter| {
            encode_parameter_in(
                parameter,
                self.inputs,
                axis,
                |local, field| {
                    let value = locals.local(local)?;
                    value.project(field)
                },
                &self.scratch,
            )
        });
        for param in encoded {
            params.push(param.map_err(RuntimeError::widen)?);
        }

        let response = self
            .client
            .query_raw(
                &transpiled,
                params
                    .iter()
                    .map(|param| -> &(dyn ToSql + Sync) { &**param }),
            )
            .await
            .map_err(|source| BridgeError::QueryExecution {
                sql: transpiled.clone(),
                source,
            })
            .map_err(RuntimeError::Suspension)?;

        let mut response = pin!(response);

        while let Some(row) = response.next().await {
            let mut partial = Partial::new(query.vertex_type);
            let decoder = Decoder::new(self.context.env, self.context.interner, &self.scratch);

            let row = row
                .map_err(|source| BridgeError::QueryExecution {
                    sql: transpiled.clone(),
                    source,
                })
                .map_err(RuntimeError::Suspension)?;
            let mut sub_interpreters = Vec::new_in(&self.scratch);

            // For now we do this synchronously because it's easier
            // TODO: how do we transition from `Interpreter -> Embedding`, do we even do that? How
            // does that work? We'd need to monitor if we're TODO: we need to redesign
            // this. We're conflating two things here (fundamentally)
            // 1. During stepping we do not consider if we need to transition again, and then what
            //    (from the interpreter that is)
            // 2. We have no way to determine where we need to go back to
            // 3. There is no real way we can have more than one postgres island per query. It just
            //    doesn't make any sense.
            // TODO: the fundamental tension is that we **must** start from postgres, and then after
            // that it's a "free for all". We must design for that.
            // This design has been conflating the ordering with only working with interpreter and
            // postgres. This is wrong by design.
            // The issue is that the postgres island is always first, and there's only ever one.
            // This is why an implicit contract, and our entrypoint. So I think that we're partially
            // there!
            // There are some other things we need to do tho:
            // 1) patching hydrated entities at transitions
            // 2) (or keeping the actual partial entity around)
            // In theory multiple islands are only possible in the case of data islands, which do
            // not generate something. Mhhh
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
                        // Find if we already have a subinterpreter for this island
                        let sub_interpreter = {
                            if let Some(interpreter) = sub_interpreters.iter_mut().find(
                                |interpreter: &&mut PartialSubinterpreter<_>| {
                                    interpreter.body == body
                                },
                            ) {
                                interpreter
                            } else {
                                sub_interpreters.push_mut(PartialSubinterpreter::new(body, island))
                            }
                        };

                        sub_interpreter
                            .hydrate(Indexed::new(index, column), field, &row, &self.scratch)
                            .map_err(RuntimeError::Suspension)?;
                    }
                }
            }

            // TODO: we must:
            // - spawn a local task to process the row
            //  - hydrate the entities (type driven deserialization)
            //  - for each filter (that has an exit):
            //    - resolve the items.
            //    - spawn a local task to process the filter.
            //    - only return the entity to the final set if all filters are true
            // - we can do this through a local set
        }

        // TODO: execute the bodies in parallel
        todo!()
    }

    fn fulfill() {}
}

// the goal of the bridge is it to coordinate the different sources and implementations, to allow
// for this, we use a "multi-pronged" approach, we are given the compiled queries, and all the
// bodies, and operate on them.
