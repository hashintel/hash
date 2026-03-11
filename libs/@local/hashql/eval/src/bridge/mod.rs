// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use core::alloc::Allocator;

use hashql_mir::{
    body::{Body, basic_block::BasicBlockId, terminator::GraphReadBody},
    def::{DefId, DefIdSlice},
    interpret::{CallStack, RuntimeError, suspension::GraphReadSuspension},
};

use self::{
    codec::{Inputs, encode_parameter},
    exec::Ipc,
};
use crate::postgres::{Parameter, PreparedQuery};

mod codec;
mod exec;
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

struct Bridge<'env, 'heap, A: Allocator> {
    bodies: &'env DefIdSlice<Body<'heap>>,
    queries: &'env PreparedQueries<'heap, A>,
    inputs: &'env Inputs<'heap, A>,
    ipc: Ipc,
}

impl<'env, 'heap, A: Allocator> Bridge<'env, 'heap, A> {
    fn graph_read<L: Allocator + Clone>(
        &self,
        callstack: &CallStack<'_, 'heap, L>,
        suspension: GraphReadSuspension<'_, 'heap>,
    ) -> Result<(), RuntimeError<'heap, L>> {
        let axis = &suspension.axis;
        let locals = callstack.locals()?;
        let query = self.queries.find(suspension.body, suspension.block);

        // TODO: We must ensure that there's *always* a query, in case nothing is given we fallback
        // to a prepared one, that just fetches the data required.
        // We should either do this inside of the bridge computation, or when running the postgres
        // compiler. I am thinking the postgres compiler, where we just have a "nonsensical" output.
        let transpiled = query.transpile();
        let params = query
            .parameters
            .iter()
            .map(|parameter| {
                encode_parameter(parameter, self.inputs, axis, |def, field| {
                    let local = suspension
                        .read
                        .body
                        .iter()
                        .find_map(|body| match body {
                            &GraphReadBody::Filter(filter_def, filter_local)
                                if filter_def == def =>
                            {
                                Some(filter_local)
                            }
                            GraphReadBody::Filter(..) => None,
                        })
                        .unwrap_or_else(|| unreachable!());

                    let value = locals.local(local)?;
                    value.project(field)
                })
            })
            .try_collect()?;

        self.ipc.execute_query(transpiled.to_string(), params);

        // TODO: entity hydration + interpolation

        // TODO: execute the bodies in parallel
        todo!()
    }

    fn fulfill() {}
}

// the goal of the bridge is it to coordinate the different sources and implementations, to allow
// for this, we use a "multi-pronged" approach, we are given the compiled queries, and all the
// bodies, and operate on them.
