use core::{
    alloc::Allocator,
    ops::{Index, IndexMut},
};

use hashql_core::{
    graph::{
        DirectedGraph, EdgeId, LinkedGraph, NodeId,
        algorithms::{
            Tarjan,
            tarjan::{MembersRef, StronglyConnectedComponents},
        },
    },
    heap::BumpAllocator,
    id::{HasId, Id as _, bit_vec::DenseBitSet},
};

use super::{
    PlacementRegionId,
    csp::{CyclicPlacementRegion, PlacementBlock},
};
use crate::{
    body::{Body, basic_block::BasicBlockId},
    pass::execution::terminator_placement::{TerminatorCostVec, TransMatrix},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct TrivialPlacementRegion {
    pub block: BasicBlockId,
}

#[derive(Debug)]
pub(crate) enum PlacementRegionKind<'alloc> {
    Trivial(TrivialPlacementRegion),
    Cyclic(CyclicPlacementRegion<'alloc>),
    Unassigned,
}

#[derive(Debug)]
pub(crate) struct PlacementRegion<'alloc> {
    pub id: PlacementRegionId,
    pub kind: PlacementRegionKind<'alloc>,
}

impl HasId for PlacementRegion<'_> {
    type Id = PlacementRegionId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

#[derive(Debug)]
pub(crate) struct PlacementLocation {
    pub region: PlacementRegionId,
    pub block: BasicBlockId,
}

#[derive(Debug)]
pub(crate) struct BoundaryEdge {
    pub source: PlacementLocation,
    pub target: PlacementLocation,

    pub matrix: TransMatrix,
}

pub(crate) struct Condensation<'alloc, S: BumpAllocator> {
    scc: StronglyConnectedComponents<BasicBlockId, PlacementRegionId, (), &'alloc S>,
    scc_members: MembersRef<'alloc, BasicBlockId, PlacementRegionId>,

    graph: LinkedGraph<PlacementRegion<'alloc>, BoundaryEdge, &'alloc S>,

    alloc: &'alloc S,
}

impl<'alloc, S: BumpAllocator> Condensation<'alloc, S> {
    pub(crate) fn new(
        body: &Body<'_>,
        terminators: &TerminatorCostVec<impl Allocator>,
        alloc: &'alloc S,
    ) -> Self {
        let scc = Tarjan::new_in(&body.basic_blocks, alloc).run();
        let scc_members = scc.bump_members();

        let graph = LinkedGraph::with_capacity_in(scc.node_count(), terminators.len(), alloc);

        let mut this = Self {
            scc,
            scc_members,
            graph,
            alloc,
        };

        this.fill(body, terminators);

        this
    }

    pub(crate) fn reverse_topological_order(
        &self,
    ) -> impl ExactSizeIterator<Item = PlacementRegionId> + DoubleEndedIterator {
        self.scc.iter_nodes()
    }

    pub(crate) fn incoming_edges(
        &self,
        node: PlacementRegionId,
    ) -> impl Iterator<Item = &BoundaryEdge> {
        self.graph
            .incoming_edges(NodeId::from_usize(node.as_usize()))
            .map(|edge| &edge.data)
    }

    pub(crate) fn outgoing_edges(
        &self,
        node: PlacementRegionId,
    ) -> impl Iterator<Item = &BoundaryEdge> {
        self.graph
            .outgoing_edges(NodeId::from_usize(node.as_usize()))
            .map(|edge| &edge.data)
    }

    fn fill(&mut self, body: &Body<'_>, terminators: &TerminatorCostVec<impl Allocator>) {
        for scc in self.scc.iter_nodes() {
            let members = self.scc_members.of(scc);

            let kind = match members {
                [] => unreachable!(),
                &[member] => PlacementRegionKind::Trivial(TrivialPlacementRegion { block: member }),
                members => {
                    let len = members.len();

                    let blocks = self
                        .alloc
                        .allocate_slice_uninit(len)
                        .write_filled(PlacementBlock::PLACEHOLDER);

                    PlacementRegionKind::Cyclic(CyclicPlacementRegion {
                        members,
                        blocks,
                        fixed: DenseBitSet::new_empty(body.basic_blocks.len()),
                        solutions: None,
                    })
                }
            };

            let id = self.graph.add_node(PlacementRegion { id: scc, kind });
            debug_assert_eq!(scc.as_usize(), id.as_usize());
        }

        for (source, source_block) in body.basic_blocks.iter_enumerated() {
            let matrices = terminators.of(source);
            for (index, target) in source_block.terminator.kind.successor_blocks().enumerate() {
                let source_scc = self.scc.scc(source);
                let target_scc = self.scc.scc(target);

                self.graph.add_edge(
                    NodeId::new(source_scc.as_usize()),
                    NodeId::new(target_scc.as_usize()),
                    BoundaryEdge {
                        source: PlacementLocation {
                            region: source_scc,
                            block: source,
                        },
                        target: PlacementLocation {
                            region: target_scc,
                            block: target,
                        },
                        matrix: matrices[index],
                    },
                );
            }
        }
    }
}

impl<'alloc, S: BumpAllocator> DirectedGraph for Condensation<'alloc, S> {
    type Edge<'this>
        = &'this BoundaryEdge
    where
        Self: 'this;
    type EdgeId = EdgeId;
    type Node<'this>
        = &'this PlacementRegion<'alloc>
    where
        Self: 'this;
    type NodeId = PlacementRegionId;

    fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        self.graph.iter_nodes().map(|node| &node.data)
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        self.graph.iter_edges().map(|edge| &edge.data)
    }
}

impl<S: BumpAllocator> IndexMut<PlacementRegionId> for Condensation<'_, S> {
    fn index_mut(&mut self, index: PlacementRegionId) -> &mut Self::Output {
        &mut self.graph[NodeId::new(index.as_usize())].data
    }
}

impl<'alloc, S: BumpAllocator> Index<PlacementRegionId> for Condensation<'alloc, S> {
    type Output = PlacementRegion<'alloc>;

    fn index(&self, index: PlacementRegionId) -> &Self::Output {
        &self.graph[NodeId::new(index.as_usize())].data
    }
}
