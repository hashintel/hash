// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use std::alloc::Allocator;

use hashql_mir::{
    body::{Body, terminator::GraphRead},
    def::{DefIdSet, DefIdSlice},
    interpret::Locals,
};

use crate::postgres::PreparedQuery;

mod postgres_serde;

struct Bridge<'env, 'heap, A: Allocator> {
    bodies: &'env DefIdSlice<Body<'heap>>,
    queries: &'env DefIdSlice<Option<PreparedQuery<'heap, A>>>,
}

impl<'env, 'heap, A: Allocator> Bridge<'env, 'heap, A> {
    fn run(
        &self,
        locals: &Locals<'_, 'heap, impl Allocator>,
        GraphRead {
            head,
            body,
            tail,
            target,
        }: &GraphRead<'heap>,
    ) {
        match tail {
            hashql_mir::body::terminator::GraphReadTail::Collect => {
                // currently the only one supported is getting all the data
            }
        }

        // TODO: execute the bodies in parallel
    }
}

// the goal of the bridge is it to coordinate the different sources and implementations, to allow
// for this, we use a "multi-pronged" approach, we are given the compiled queries, and all the
// bodies, and operate on them.
