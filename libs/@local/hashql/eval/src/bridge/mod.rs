// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use core::{alloc::Allocator, marker::PhantomData, pin::pin};

use futures_lite::StreamExt as _;
use hashql_core::heap::{ResetAllocator as _, Scratch};
use hashql_mir::{
    body::{Body, basic_block::BasicBlockId},
    def::{DefId, DefIdSlice},
    interpret::{CallStack, RuntimeError, suspension::GraphReadSuspension},
};
use postgres_types::ToSql;
use tokio_postgres::Client;

use self::{
    codec::{Inputs, encode_parameter_in},
    error::BridgeError,
};
use crate::postgres::{Parameter, PreparedQuery};

mod codec;
pub(crate) mod error;
mod postgres_serde;
mod temporal;

struct PreparedQueries<'heap, A: Allocator> {
    offsets: Box<DefIdSlice<usize>, A>,
    queries: Vec<PreparedQuery<'heap, A>, A>,
}

impl<'heap, A: Allocator> PreparedQueries<'heap, A> {
    fn find(&self, body: DefId, block: BasicBlockId) -> &PreparedQuery<'heap, A> {
        todo!()
    }
}

struct Bridge<'env, 'heap, C, A: Allocator> {
    client: Client,
    bodies: &'env DefIdSlice<Body<'heap>>,
    queries: &'env PreparedQueries<'heap, A>,
    inputs: &'env Inputs<'heap, A>,

    scratch: Scratch, // <- TODO: must be a pool
    _marker: PhantomData<C>,
}

impl<'heap, C, A: Allocator> Bridge<'_, 'heap, C, A> {
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
            let row = row
                .map_err(|source| BridgeError::QueryExecution {
                    sql: transpiled.clone(),
                    source,
                })
                .map_err(RuntimeError::Suspension)?;

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
