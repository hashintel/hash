//! Island dependency graph with data requirement resolution.
//!
//! After [`IslandPlacement`] groups basic blocks into [`Island`]s by target, this module
//! builds a directed graph over those islands, resolves which traversal paths each island
//! needs, and inserts synthetic data islands for paths that cannot be satisfied by an
//! upstream provider.
//!
//! Three edge kinds connect islands:
//!
//! - [`ControlFlow`]: the source island must complete before the target island begins.
//! - [`DataFlow`]: the target island consumes data produced by the source island.
//! - [`Inherits`]: the target island inherits provided paths from the source island.
//!
//! [`IslandPlacement`]: super::IslandPlacement
//! [`Island`]: super::Island
//! [`ControlFlow`]: IslandEdge::ControlFlow
//! [`DataFlow`]: IslandEdge::DataFlow
//! [`Inherits`]: IslandEdge::Inherits

#[cfg(test)]
pub(crate) mod tests;

use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    ops::{Index, IndexMut},
};

use hashql_core::{
    debug_panic,
    graph::{
        DirectedGraph, EdgeId, LinkedGraph, NodeId, Predecessors, Successors, Traverse as _,
        algorithms::{Dominators, dominators},
        linked::Edge,
    },
    heap::CollectIn as _,
    id::{
        HasId as _, Id as _,
        bit_vec::{BitMatrix, DenseBitSet},
    },
};

use super::{Island, IslandId, IslandVec};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockVec},
    },
    pass::execution::{
        TargetId, VertexType,
        target::{TargetArray, TargetBitSet},
        traversal::{TraversalPath, TraversalPathBitSet},
    },
};

/// The kind of dependency between two islands.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum IslandEdge {
    /// The source island must complete before the target island begins.
    ControlFlow,
    /// The target island consumes data produced by the source island.
    DataFlow,
    /// The target island inherits provided paths from the source island.
    Inherits,
}

/// A computation island backed by a set of basic blocks from the placement solver.
#[derive(Debug)]
pub struct ExecIsland {
    members: DenseBitSet<BasicBlockId>,
}

impl ExecIsland {
    /// Returns `true` if `block` belongs to this island.
    #[inline]
    #[must_use]
    pub fn contains(&self, block: BasicBlockId) -> bool {
        self.members.contains(block)
    }

    /// Iterates over the [`BasicBlockId`]s in this island in ascending order.
    #[inline]
    pub fn iter(&self) -> impl Iterator<Item = BasicBlockId> + '_ {
        self.members.iter()
    }
}

/// Whether an island node represents computation or a data fetch.
#[derive(Debug)]
pub enum IslandKind {
    /// An island containing basic blocks that execute on its assigned target.
    Exec(ExecIsland),
    /// A synthetic island that fetches data from its assigned target.
    Data,
}

/// A node in the island dependency graph.
///
/// Each node tracks which traversal paths it requires and which it provides.
#[derive(Debug)]
pub struct IslandNode {
    kind: IslandKind,
    target: TargetId,
    requires: TraversalPathBitSet,
    provides: TraversalPathBitSet,
}

impl IslandNode {
    /// Returns the kind of this island node.
    #[inline]
    #[must_use]
    pub const fn kind(&self) -> &IslandKind {
        &self.kind
    }

    /// Returns the execution target this island runs on.
    #[inline]
    #[must_use]
    pub const fn target(&self) -> TargetId {
        self.target
    }

    /// Returns the set of traversal paths this island requires.
    #[inline]
    #[must_use]
    pub const fn requires(&self) -> TraversalPathBitSet {
        self.requires
    }

    /// Returns the set of traversal paths this island provides.
    #[inline]
    #[must_use]
    pub const fn provides(&self) -> TraversalPathBitSet {
        self.provides
    }
}

/// Directed graph over [`IslandNode`]s connected by [`IslandEdge`]s.
///
/// Supports indexing by [`IslandId`] and implements [`DirectedGraph`], [`Successors`],
/// and [`Predecessors`].
pub struct IslandGraph<A: Allocator> {
    vertex: VertexType,
    inner: LinkedGraph<IslandNode, IslandEdge, A>,
    lookup: BasicBlockVec<IslandId, A>,
}

impl IslandGraph<Global> {
    pub fn new(
        body: &Body<'_>,
        vertex: VertexType,
        islands: IslandVec<Island, impl Allocator>,
    ) -> Self {
        Self::new_in(body, vertex, islands, Global, Global)
    }
}

impl<A: Allocator> IslandGraph<A> {
    pub fn new_in<S>(
        body: &Body<'_>,
        vertex: VertexType,
        islands: IslandVec<Island, impl Allocator>,
        scratch: S,
        alloc: A,
    ) -> Self
    where
        S: Allocator + Clone,
        A: Clone,
    {
        let mut this = Self::build_in(body, vertex, islands, scratch.clone(), alloc);
        this.resolve(scratch);

        this
    }

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
                lookup[block_id] = island_id;
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

    /// Resolves all island requirements and inserts data islands where needed.
    pub(crate) fn resolve<S>(&mut self, scratch: S)
    where
        S: Allocator + Clone,
    {
        let mut topo: Vec<IslandId, _> = self
            .inner
            .depth_first_forest_post_order()
            .map(|node| IslandId::new(node.as_u32()))
            .collect_in(scratch.clone());
        topo.reverse();

        let start = self.lookup[BasicBlockId::START];

        RequirementResolver::new(self, start, scratch).resolve(&topo);
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

/// Returns the nearest strict dominator of `node` assigned to `target`, along with its
/// depth (0 = immediate dominator).
fn find_dominator_by_target(
    dominators: &Dominators<IslandId>,
    graph: &IslandGraph<impl Allocator>,
    node: IslandId,
    target: TargetId,
) -> Option<(IslandId, usize)> {
    let mut current = node;
    let mut depth = 0;

    loop {
        let parent = dominators.immediate_dominator(current)?;
        if parent == current {
            return None;
        }

        if graph[parent].target == target {
            return Some((parent, depth));
        }

        current = parent;
        depth += 1;
    }
}

/// Resolves data requirements for all islands, inserting data islands where needed.
struct RequirementResolver<'graph, A: Allocator, S: Allocator> {
    graph: &'graph mut IslandGraph<A>,
    dominators: Dominators<IslandId>,
    merged_provides: IslandVec<TraversalPathBitSet, S>,
    data_providers: TargetArray<Option<IslandId>>,
}

impl<'graph, A: Allocator, S: Allocator + Clone> RequirementResolver<'graph, A, S> {
    fn new(graph: &'graph mut IslandGraph<A>, start: IslandId, scratch: S) -> Self {
        let dominators = dominators(&*graph, start);
        let merged_provides = IslandVec::from_elem_in(
            TraversalPathBitSet::empty(graph.vertex),
            graph.node_count(),
            scratch,
        );

        Self {
            graph,
            dominators,
            merged_provides,
            data_providers: TargetArray::from_elem(None),
        }
    }

    fn resolve(mut self, topo: &[IslandId]) {
        // Iterate in reverse for topological order
        for &island_id in topo {
            let island = &self.graph[island_id];
            let IslandKind::Exec(_) = &island.kind else {
                debug_panic!("data islands should not be present during requirement resolution");
                continue;
            };

            self.inherit_provides(island_id);
            self.resolve_island(island_id);
        }
    }

    /// If a same-target dominator exists, inherits its provided paths via an `Inherits` edge.
    fn inherit_provides(&mut self, island_id: IslandId) {
        let island_target = self.graph[island_id].target;

        if let Some((parent, _)) =
            find_dominator_by_target(&self.dominators, self.graph, island_id, island_target)
        {
            self.merged_provides.copy_within(parent..=parent, island_id);
            self.graph.inner.add_edge(
                NodeId::from_u32(parent.as_u32()),
                NodeId::from_u32(island_id.as_u32()),
                IslandEdge::Inherits,
            );
        }
    }

    /// Resolves requirements for a single island.
    ///
    /// Paths whose origin includes this island's own target are self-provided and need no
    /// external provider. All other paths are resolved via dominator walk or data island.
    fn resolve_island(&mut self, island_id: IslandId) {
        let requires = self.graph[island_id].requires;
        if requires.is_empty() {
            return;
        }

        let island_target = self.graph[island_id].target;

        // Cache dominator lookups per target to avoid repeated walks.
        let mut cached = TargetArray::from_elem(None);

        for requirement in &requires {
            let origin = requirement.origin();
            debug_assert!(!origin.is_empty());

            // If this island runs on an origin backend for the path, it self-provides.
            if origin.contains(island_target) {
                if !self.merged_provides[island_id].contains(requirement) {
                    self.merged_provides[island_id].insert(requirement);
                    self.graph[island_id].provides.insert(requirement);
                }
                continue;
            }

            let provider = self.find_best_provider(&mut cached, island_id, origin);
            let provider = provider.unwrap_or_else(|| self.get_or_create_data_island(origin));

            self.register_path(provider, island_id, requirement);
        }
    }

    /// Finds the nearest dominating provider among the potential origin targets.
    #[expect(clippy::option_option)]
    fn find_best_provider(
        &self,
        cached: &mut TargetArray<Option<Option<(IslandId, usize)>>>,
        island_id: IslandId,
        origin: TargetBitSet,
    ) -> Option<IslandId> {
        origin
            .iter()
            .filter_map(|target| {
                *cached[target].get_or_insert_with(|| {
                    find_dominator_by_target(&self.dominators, self.graph, island_id, target)
                })
            })
            .min_by_key(|&(_, depth)| depth)
            .map(|(provider, _)| provider)
    }

    /// Registers a path as provided by `provider` for consumption by `consumer`.
    fn register_path(&mut self, provider: IslandId, consumer: IslandId, path: TraversalPath) {
        if !self.merged_provides[provider].contains(path) {
            self.merged_provides[provider].insert(path);
            self.graph[provider].provides.insert(path);
        }

        self.graph.inner.add_edge(
            NodeId::from_u32(provider.as_u32()),
            NodeId::from_u32(consumer.as_u32()),
            IslandEdge::DataFlow,
        );
    }

    /// Returns an existing data island for the given origin backend, or creates one.
    fn get_or_create_data_island(&mut self, origin: TargetBitSet) -> IslandId {
        // Check if *any* of the providers already have an initialised provider, if that's the case
        // we create our own.
        if let Some(provider) = origin.iter().find_map(|target| self.data_providers[target]) {
            return provider;
        }

        // `TargetId` is ordered by backend priority, so the first set bit gives us the best target
        // (note that interpreter is technically first, but never a target for data).
        let target = origin.first_set().unwrap_or_else(|| unreachable!());

        if let Some(provider) = self.data_providers[target] {
            return provider;
        }

        let node = self.graph.inner.add_node(IslandNode {
            kind: IslandKind::Data,
            target,
            requires: TraversalPathBitSet::empty(self.graph.vertex),
            provides: TraversalPathBitSet::empty(self.graph.vertex),
        });
        let provider = IslandId::from_u32(node.as_u32());
        self.data_providers[target] = Some(provider);
        self.merged_provides
            .push(TraversalPathBitSet::empty(self.graph.vertex));

        provider
    }
}
