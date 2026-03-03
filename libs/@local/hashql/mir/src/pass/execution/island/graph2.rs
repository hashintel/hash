use core::ops::{Index, IndexMut};
use std::alloc::Allocator;

use hashql_core::{
    debug_panic,
    graph::{
        DirectedGraph, EdgeId, LinkedGraph, NodeId, Predecessors, Successors, Traverse,
        algorithms::{Dominators, dominators},
        linked::Edge,
    },
    heap::CollectIn,
    id::{
        HasId, Id,
        bit_vec::{BitMatrix, DenseBitSet},
    },
};

use super::{Island, IslandId, IslandVec};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockVec},
    },
    pass::execution::{TargetId, VertexType, target::TargetArray, traversal::TraversalPathBitSet},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum IslandEdge {
    ControlFlow,
    DataFlow,
    Inherits,
}

#[derive(Debug)]
pub struct ExecIsland {
    members: DenseBitSet<BasicBlockId>,
}

#[derive(Debug)]
pub enum IslandKind {
    Exec(ExecIsland),
    Data,
}

#[derive(Debug)]
pub struct IslandNode {
    kind: IslandKind,

    target: TargetId,

    requires: TraversalPathBitSet,
    provides: TraversalPathBitSet,
}

pub struct IslandGraph<A: Allocator> {
    vertex: VertexType,

    inner: LinkedGraph<IslandNode, IslandEdge, A>,
    lookup: BasicBlockVec<IslandId, A>,
}

impl<A: Allocator> IslandGraph<A> {
    fn build_in<S>(
        body: &Body<'_>,
        vertex: VertexType,
        islands: IslandVec<Island, impl Allocator>,
        scratch: S,
        alloc: A,
    ) -> Self
    where
        S: Allocator,
        A: Clone,
    {
        let mut lookup =
            BasicBlockVec::from_domain_in(IslandId::MAX, &body.basic_blocks, alloc.clone());
        let mut graph =
            LinkedGraph::with_capacity_in(islands.len(), body.basic_blocks.edge_count(), alloc);
        let mut matrix = BitMatrix::new_in(islands.len(), islands.len(), scratch);

        for (
            island_id,
            Island {
                target,
                members,
                traversals,
            },
        ) in islands.into_iter_enumerated()
        {
            for block_id in &members {
                lookup[block_id] = island_id
            }

            let node_id = graph.add_node(IslandNode {
                kind: IslandKind::Exec(ExecIsland { members }),

                target,
                requires: traversals,
                provides: TraversalPathBitSet::empty(vertex),
            });
            debug_assert_eq!(node_id.as_u32(), island_id.as_u32());
        }

        for block_id in body.basic_blocks.ids() {
            let source = lookup[block_id];

            for successor in body.basic_blocks.successors(block_id) {
                let target = lookup[successor];

                // We *ignore* anything that points locally within the same island, to deduplicate
                // work we also do not duplicate any edges
                if source == target || matrix.contains(source, target) {
                    continue;
                }

                matrix.insert(source, target);
                graph.add_edge(
                    NodeId::new(source.as_u32()),
                    NodeId::new(target.as_u32()),
                    IslandEdge::ControlFlow,
                );
            }
        }

        Self {
            vertex,
            inner: graph,
            lookup,
        }
    }

    fn resolve_requirements<S>(&mut self, topo: &[IslandId], scratch: S)
    where
        S: Allocator + Clone,
    {
        if topo.is_empty() {
            return;
        }

        let start = self.lookup[BasicBlockId::START];
        let dominators = dominators(self, start);

        let mut merged_provides = IslandVec::from_elem_in(
            TraversalPathBitSet::empty(self.vertex),
            self.node_count(),
            scratch,
        );
        let mut data_providers = TargetArray::from_elem(None);

        for &island_id in topo {
            let island = &self.inner[NodeId::new(island_id.as_u32())].data;
            let IslandKind::Exec(exec) = &island.kind else {
                debug_panic!("data islands should not be available yet");

                continue;
            };

            // Get the immediate dominator of this island, and copy the what we provide, this allows
            // us to minify the amount of data required across multiple islands.
            if let Some((parent, _)) =
                find_dominator_by_target(&dominators, self, island_id, island.target)
            {
                merged_provides.copy_within(parent..=parent, island_id);
                self.inner.add_edge(
                    NodeId::from_u32(island_id.as_u32()),
                    NodeId::from_u32(parent.as_u32()),
                    IslandEdge::Inherits,
                );
            }

            // Now for the data that we require, find the backend that satisfies it, because there
            // *may* be cases, in which the data is satisfied from multiple parties we pick the one
            // that is "closest" to us in terms of the dominator tree. We save the closest provider
            // lazily, and only initialize them where necessary.
            let mut providers = TargetArray::from_elem(None);

            for requirement in &island.requires {
                let potential_targets = requirement.origin();
                debug_assert!(!potential_targets.is_empty());

                let mut current_candidate = None;
                for target in &potential_targets {
                    debug_assert_ne!(
                        target, island.target,
                        "island should never require its own target"
                    );

                    // Find if we need to re-compute the dominator for this target and node,
                    // otherwise we can just use the result of the previous iteration
                    if providers[target].is_none() {
                        // We "double-some" to ensure that we don't recompute every-time if there's
                        // no dominator.
                        providers[target] = Some(find_dominator_by_target(
                            &dominators,
                            self,
                            island_id,
                            target,
                        ));
                    }

                    if let Some((provider, depth)) = providers[target].flatten() {
                        // There *does* exist a dominator, check if we already have a candidate
                        if let Some((_, existing_depth)) = current_candidate {
                            if depth < existing_depth {
                                current_candidate = Some((provider, depth));
                            }
                        } else {
                            current_candidate = Some((provider, depth));
                        }
                    }
                }

                if let Some((provider, _)) = current_candidate {
                    if !merged_provides[provider].contains(requirement) {
                        merged_provides[provider].insert(requirement);
                        self[provider].provides.insert(requirement);
                    }

                    self.inner.add_edge(
                        NodeId::from_u32(island_id.as_u32()),
                        NodeId::from_u32(provider.as_u32()),
                        IslandEdge::DataFlow,
                    );
                } else {
                    // Find the first that fits, the order of TargetId guarantees that the most
                    // ideal (except for interpreter) is first. We need *some* way to determine
                    // preference
                    // TODO: check if we already have a backend provider, then do that

                    let first = potential_targets
                        .first_set()
                        .unwrap_or_else(|| unreachable!());

                    let provider = if let Some(provider) = data_providers[first] {
                        provider
                    } else {
                        let node = self.inner.add_node(IslandNode {
                            kind: IslandKind::Data,
                            target: first,
                            requires: TraversalPathBitSet::empty(self.vertex),
                            provides: TraversalPathBitSet::empty(self.vertex),
                        });
                        let node = IslandId::from_u32(node.as_u32());
                        data_providers[first] = Some(node);

                        node
                    };

                    if !merged_provides[provider].contains(requirement) {
                        merged_provides[provider].insert(requirement);
                        self[provider].provides.insert(requirement);
                    }

                    self.inner.add_edge(
                        NodeId::from_u32(island_id.as_u32()),
                        NodeId::from_u32(provider.as_u32()),
                        IslandEdge::DataFlow,
                    );
                }
            }
        }
        todo!()
    }

    fn resolve<S>(&mut self, scratch: S)
    where
        S: Allocator + Clone,
    {
        // RPO is a valid topological ordering of the islands, where each island is visited after
        // all of its predecessors.
        let topo: Vec<_, _> = self
            .inner
            .depth_first_forest_post_order()
            .map(|node| IslandId::new(node.as_u32()))
            .collect_in(scratch.clone());
    }
}

impl<A: Allocator> DirectedGraph for IslandGraph<A> {
    type Edge<'this>
        = &'this Edge<IslandEdge>
    where
        Self: 'this;
    type EdgeId = EdgeId;
    type Node<'this>
        = (IslandId, &'this IslandNode)
    where
        Self: 'this;
    type NodeId = IslandId;

    fn node_count(&self) -> usize {
        self.inner.node_count()
    }

    fn edge_count(&self) -> usize {
        self.inner.edge_count()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        self.inner
            .iter_nodes()
            .map(|node| (IslandId::from_u32(node.id().as_u32()), &node.data))
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        self.inner.iter_edges()
    }
}

impl<A: Allocator> Successors for IslandGraph<A> {
    type SuccIter<'this>
        = impl Iterator<Item = Self::NodeId> + 'this
    where
        Self: 'this;

    fn successors(&self, node: Self::NodeId) -> Self::SuccIter<'_> {
        self.inner
            .successors(NodeId::new(node.as_u32()))
            .map(|node| IslandId::new(node.as_u32()))
    }
}

impl<A: Allocator> Predecessors for IslandGraph<A> {
    type PredIter<'this>
        = impl Iterator<Item = Self::NodeId> + 'this
    where
        Self: 'this;

    fn predecessors(&self, node: Self::NodeId) -> Self::PredIter<'_> {
        self.inner
            .predecessors(NodeId::new(node.as_u32()))
            .map(|node| IslandId::new(node.as_u32()))
    }
}

impl<A: Allocator> IndexMut<IslandId> for IslandGraph<A> {
    fn index_mut(&mut self, index: IslandId) -> &mut Self::Output {
        &mut self.inner[NodeId::new(index.as_u32())].data
    }
}

impl<A: Allocator> Index<IslandId> for IslandGraph<A> {
    type Output = IslandNode;

    fn index(&self, index: IslandId) -> &Self::Output {
        &self.inner[NodeId::new(index.as_u32())].data
    }
}

fn find_dominator_by_target(
    dominators: &Dominators<IslandId>,
    graph: &IslandGraph<impl Allocator>,
    node: IslandId,
    requirement: TargetId,
) -> Option<(IslandId, usize)> {
    let mut current = node;
    let mut depth = 0;

    loop {
        let parent = dominators.immediate_dominator(current)?;
        if parent == node {
            return None; // is that even possible?
        }

        if graph[parent].target == requirement {
            return Some((parent, depth));
        }

        current = parent;
        depth += 1;
    }
}
