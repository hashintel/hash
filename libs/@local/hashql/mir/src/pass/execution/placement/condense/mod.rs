use std::alloc::Allocator;

use hashql_core::{
    graph::{DirectedGraph, LinkedGraph, algorithms::Tarjan},
    id::{self, Id, IdVec},
};

use crate::body::{Body, basic_block::BasicBlockId};

id::newtype!(struct PlacementRegionId(u32 is 0..=0xFFFF_FF00));

pub struct PlacementRegion<'scc> {
    id: PlacementRegionId,
    members: &'scc [BasicBlockId],
}

fn condense<'heap, A>(body: &Body<'heap>, alloc: A)
where
    A: Allocator + Clone,
{
    let tarjan = Tarjan::new_in(&body.basic_blocks, alloc.clone());
    let scc = tarjan.run();
    let members = scc.members();
    let mut graph = LinkedGraph::new();

    let mut regions: IdVec<PlacementRegionId, PlacementRegion<'_>, A> =
        IdVec::with_capacity_in(scc.node_count(), alloc.clone());

    for scc in scc.iter_nodes() {
        let id = graph.add_node(PlacementRegion {
            id: scc,
            members: members.of(scc),
        });
        debug_assert_eq!(scc.as_usize(), id.as_usize());
    }

    unimplemented!()
}
