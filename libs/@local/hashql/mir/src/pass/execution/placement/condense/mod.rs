use std::alloc::Allocator;

use hashql_core::{
    graph::{DirectedGraph, LinkedGraph, NodeId, algorithms::Tarjan},
    id::{self, Id, IdVec},
};

use crate::{
    body::{Body, basic_block::BasicBlockId},
    def::DefIdSlice,
    pass::execution::{
        target::TargetBitSet,
        terminator_placement::{TerminatorCostVec, TransMatrix},
    },
};

id::newtype!(struct PlacementRegionId(u32 is 0..=0xFFFF_FF00));

pub struct PlacementRegion<'scc> {
    id: PlacementRegionId,
    members: &'scc [BasicBlockId],
}

pub struct BoundaryEdge {
    source: BasicBlockId,
    target: BasicBlockId,
    matrix: TransMatrix,
}

pub struct Condense<'ctx, A: Allocator> {
    pub targets: &'ctx mut DefIdSlice<TargetBitSet>,
    pub terminators: &'ctx mut TerminatorCostVec<A>,
}

impl<'ctx, A: Allocator> Condense<'ctx, A> {
    fn run_in<'heap, B>(&self, body: &Body<'heap>, alloc: B)
    where
        B: Allocator + Clone,
    {
        let tarjan = Tarjan::new_in(&body.basic_blocks, alloc.clone());
        let scc = tarjan.run();
        let members = scc.members();
        let mut graph =
            LinkedGraph::with_capacity_in(scc.node_count(), self.terminators.len(), alloc);

        // backup the targets into a vec that we can work with

        for scc in scc.iter_nodes() {
            let id = graph.add_node(PlacementRegion {
                id: scc,
                members: members.of(scc),
            });
            debug_assert_eq!(scc.as_usize(), id.as_usize());
        }

        for (source, source_block) in body.basic_blocks.iter_enumerated() {
            let matrices = self.terminators.of(source);
            for (index, target) in source_block.terminator.kind.successor_blocks().enumerate() {
                let source_scc = scc.scc(source);
                let target_scc = scc.scc(target);

                graph.add_edge(
                    NodeId::from_usize(source_scc.as_usize()),
                    NodeId::from_usize(target_scc.as_usize()),
                    BoundaryEdge {
                        source,
                        target,
                        matrix: matrices[index],
                    },
                );
            }
        }

        // Now that we have all the edges we must do a forwards and backwards sweep, scc gives us
        // the reverse topological order, meaning that the forwards is simply the backwards
        // traversal of the scc.

        // Create the edges between all the different scc, each edge has a specified block origin

        unimplemented!()
    }
}
