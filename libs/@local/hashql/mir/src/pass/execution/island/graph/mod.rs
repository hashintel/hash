//! Island dependency graph with requirement-based edges and fetch island insertion.
//!
//! Builds a directed graph over [`Island`]s where edges carry the [`EntityPathBitSet`]s
//! that flow between islands. Two edge kinds exist:
//!
//! - **CFG edges**: derived from block-level control flow crossing island boundaries. The successor
//!   island consumes data the predecessor island produces.
//! - **Data edges**: an island needs entity paths from a non-adjacent producer. The data is fetched
//!   directly from the producer's backend, not routed through intermediaries.
//!
//! When an island requires paths that no dominating predecessor can provide, a
//! [`FetchIsland`] is inserted as a synthetic parallel predecessor dedicated to fetching
//! that data from the origin backend.
//!
//! The output includes a topological schedule with level assignment for parallelism:
//! islands at the same level with no edges between them can execute concurrently.

use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{
    graph::{DirectedGraph, Predecessors, Successors, algorithms::dominators},
    id::{self, Id, IdVec, bit_vec::DenseBitSet},
};

use super::{Island, IslandId, IslandSlice, IslandVec};
use crate::pass::execution::{
    VertexType,
    target::TargetId,
    traversal::{EntityPathBitSet, TraversalPath, TraversalPathBitSet},
};

#[cfg(test)]
mod tests;

id::newtype!(
    /// Identifies a node in the [`IslandGraph`], which may be either a real [`Island`]
    /// or a synthetic [`FetchIsland`].
    pub struct IslandNodeId(u32 is 0..=0xFFFF_FF00)
);
id::newtype_collections!(pub type IslandNode* from IslandNodeId);

/// The kind of edge in the island dependency graph.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum IslandEdgeKind {
    /// Direct control flow between islands (block-level CFG edge crossing an island boundary).
    Cfg,
    /// Data dependency where the consumer fetches directly from the producer's backend.
    Data,
}

/// A directed edge in the island dependency graph.
///
/// Carries the set of entity paths that flow from the source island to the target island,
/// along with the edge kind.
#[derive(Debug, Clone)]
pub struct IslandEdge {
    pub source: IslandNodeId,
    pub target: IslandNodeId,
    pub kind: IslandEdgeKind,
    pub paths: EntityPathBitSet,
}

/// A synthetic island that exists solely to fetch entity data from a specific backend.
///
/// Inserted when a real island requires entity paths that no dominating predecessor
/// can provide. Groups all unsatisfied paths for a single origin backend into one fetch
/// operation.
#[derive(Debug, Clone)]
pub struct FetchIsland {
    pub target: TargetId,
    pub paths: EntityPathBitSet,
}

/// A node in the island dependency graph: either a real computation island or a
/// synthetic fetch island.
#[derive(Debug, Clone)]
pub enum IslandNode {
    /// A real island from the placement solver.
    Real(IslandId),
    /// A synthetic fetch island inserted to satisfy data requirements.
    Fetch(FetchIsland),
}

impl IslandNode {
    /// Returns the execution target for this node.
    #[must_use]
    pub fn target(&self, islands: &IslandSlice<Island>) -> TargetId {
        match self {
            Self::Real(island_id) => islands[*island_id].target(),
            Self::Fetch(fetch) => fetch.target,
        }
    }
}

/// A scheduled island with its parallelism level.
///
/// Islands at the same level have no dependencies between them and can execute concurrently.
/// Level 0 contains islands with no predecessors (entry points and independent fetch islands).
#[derive(Debug, Copy, Clone)]
pub struct ScheduledIsland {
    pub node: IslandNodeId,
    pub level: u32,
}

/// The island dependency graph.
///
/// Contains the set of island nodes (real + fetch), directed edges with path requirements,
/// and a topological schedule with level assignment for parallelism.
#[derive(Debug)]
pub struct IslandGraph {
    pub nodes: IslandNodeVec<IslandNode>,
    pub edges: Vec<IslandEdge>,
    pub schedule: Vec<ScheduledIsland>,
}

/// Adapter that provides [`DirectedGraph`], [`Successors`], and [`Predecessors`] over
/// island nodes, enabling dominator computation on the island-level CFG.
struct IslandCfg {
    node_count: usize,
    successors: IslandNodeVec<Vec<IslandNodeId>>,
    predecessors: IslandNodeVec<Vec<IslandNodeId>>,
}

impl IslandCfg {
    fn new(node_count: usize) -> Self {
        Self {
            node_count,
            successors: IslandNodeVec::from_fn_in(node_count, |_| Vec::new(), Global),
            predecessors: IslandNodeVec::from_fn_in(node_count, |_| Vec::new(), Global),
        }
    }

    fn add_edge(&mut self, source: IslandNodeId, target: IslandNodeId) {
        if !self.successors[source].contains(&target) {
            self.successors[source].push(target);
            self.predecessors[target].push(source);
        }
    }
}

impl DirectedGraph for IslandCfg {
    type Edge<'this> = (IslandNodeId, IslandNodeId);
    type EdgeId = (IslandNodeId, IslandNodeId);
    type Node<'this> = (IslandNodeId, &'this [IslandNodeId]);
    type NodeId = IslandNodeId;

    fn node_count(&self) -> usize {
        self.node_count
    }

    fn edge_count(&self) -> usize {
        self.successors.iter().map(|succs| succs.len()).sum()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        self.successors
            .iter_enumerated()
            .map(|(id, succs)| (id, succs.as_slice()))
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        // Not needed for dominator computation, provide a dummy implementation.
        [].into_iter()
    }
}

impl Successors for IslandCfg {
    type SuccIter<'this> = impl Iterator<Item = IslandNodeId> + 'this;

    fn successors(&self, node: Self::NodeId) -> Self::SuccIter<'_> {
        self.successors[node].iter().copied()
    }
}

impl Predecessors for IslandCfg {
    type PredIter<'this> = impl Iterator<Item = IslandNodeId> + 'this;

    fn predecessors(&self, node: Self::NodeId) -> Self::PredIter<'_> {
        self.predecessors[node].iter().copied()
    }
}

/// Maps a block-level CFG into island-level CFG edges.
///
/// For each block-level CFG edge where the source and target belong to different islands,
/// adds an edge between the corresponding island nodes.
fn build_island_cfg<A: Allocator>(
    body: &crate::body::Body<'_>,
    islands: &IslandSlice<Island>,
    block_to_island: &crate::body::basic_block::BasicBlockSlice<IslandNodeId>,
    cfg: &mut IslandCfg,
    edges: &mut Vec<IslandEdge>,
    alloc: &A,
) {
    use hashql_core::graph::Successors as _;

    for block in body.basic_blocks.ids() {
        let source_island = block_to_island[block];

        for successor in body.basic_blocks.successors(block) {
            let target_island = block_to_island[successor];

            if source_island != target_island {
                cfg.add_edge(source_island, target_island);

                // Check if this CFG edge already exists in our edge list.
                let existing = edges.iter_mut().find(|edge| {
                    edge.source == source_island
                        && edge.target == target_island
                        && edge.kind == IslandEdgeKind::Cfg
                });

                if existing.is_none() {
                    edges.push(IslandEdge {
                        source: source_island,
                        target: target_island,
                        kind: IslandEdgeKind::Cfg,
                        paths: EntityPathBitSet::new_empty(),
                    });
                }
            }
        }
    }
}

/// Resolves data requirements for each island using dominance-aware provider search.
///
/// Walks islands in topological order. For each required path in an island's traversal set,
/// finds the nearest dominating predecessor whose target matches the path's origin backend.
/// If found, the path is registered on that predecessor (growing its fetch set). If not,
/// a [`FetchIsland`] is created.
fn resolve_requirements(
    islands: &IslandSlice<Island>,
    nodes: &mut IslandNodeVec<IslandNode>,
    cfg: &mut IslandCfg,
    edges: &mut Vec<IslandEdge>,
    topo_order: &[IslandNodeId],
    vertex: VertexType,
) {
    let doms = dominators(&*cfg, IslandNodeId::new(0));

    // For each island, track which paths are "available" from dominating predecessors,
    // grouped by the origin backend that provides them.
    // We walk in topological order so predecessors are always processed before successors.

    // Per-node: which paths are available at this node, keyed by origin target.
    let mut available: IslandNodeVec<[EntityPathBitSet; TargetId::VARIANT_COUNT]> =
        IslandNodeVec::from_fn_in(
            nodes.len(),
            |_| [EntityPathBitSet::new_empty(); TargetId::VARIANT_COUNT],
            Global,
        );

    // For real islands, the island's own target makes all its fetched/produced paths available.
    for node_id in topo_order {
        let node = &nodes[*node_id];

        if let IslandNode::Real(island_id) = node {
            let island = &islands[*island_id];
            let target = island.target();

            // Paths this island accesses are available from its target backend going forward.
            if let Some(entity_paths) = island.traversals().as_entity() {
                let avail = &mut available[*node_id][target.as_usize()];
                for path in entity_paths {
                    avail.insert(path);
                }
            }
        }

        // Propagate availability to successors: a successor inherits availability from
        // all dominating predecessors.
        let current_available = available[*node_id];
        for succ in cfg.successors[*node_id].clone() {
            if doms.dominates(*node_id, succ) {
                for (target_idx, paths) in current_available.iter().enumerate() {
                    for path in paths {
                        available[succ][target_idx].insert(path);
                    }
                }
            }
        }
    }

    // Now resolve requirements: for each real island, check which of its required paths
    // are NOT available from any dominating predecessor on the correct origin backend.
    // Those need FetchIslands.
    for &node_id in topo_order {
        let node = &nodes[node_id];

        let island_id = match node {
            IslandNode::Real(island_id) => *island_id,
            IslandNode::Fetch(_) => continue,
        };

        let island = &islands[island_id];
        let required = island.traversals();

        let Some(entity_paths) = required.as_entity() else {
            continue;
        };

        if entity_paths.is_empty() {
            continue;
        }

        // Group unsatisfied paths by origin backend.
        let mut unsatisfied: [EntityPathBitSet; TargetId::VARIANT_COUNT] =
            [EntityPathBitSet::new_empty(); TargetId::VARIANT_COUNT];

        for path in entity_paths {
            let traversal_path = TraversalPath::Entity(path);
            let origin = traversal_path.origin();

            // Check if any origin backend has this path available from a dominating predecessor.
            let is_satisfied = origin
                .iter()
                .any(|origin_target| available[node_id][origin_target.as_usize()].contains(path));

            if is_satisfied {
                // Find the nearest dominating predecessor that provides this path and
                // add a data edge if one doesn't already exist.
                for origin_target in origin.iter() {
                    if available[node_id][origin_target.as_usize()].contains(path) {
                        // Find the nearest predecessor on this target by walking up the
                        // dominator tree.
                        if let Some(provider) = find_nearest_provider(
                            node_id,
                            origin_target,
                            &doms,
                            nodes,
                            islands,
                            cfg,
                        ) {
                            add_data_edge(edges, provider, node_id, path);
                        }
                        break;
                    }
                }
            } else {
                // No provider: needs a FetchIsland. Group by origin backend.
                // Use the first origin target (for EntityPath, there's always exactly one).
                if let Some(origin_target) = origin.iter().next() {
                    unsatisfied[origin_target.as_usize()].insert(path);
                }
            }
        }

        // Create FetchIslands for unsatisfied paths, one per backend.
        for target in TargetId::all() {
            let paths = &unsatisfied[target.as_usize()];
            if paths.is_empty() {
                continue;
            }

            let fetch_node_id = IslandNodeId::from_usize(nodes.len());

            // Extend the CFG adapter.
            cfg.successors.push(Vec::new());
            cfg.predecessors.push(Vec::new());
            cfg.node_count += 1;

            // Extend available.
            // (We won't re-process this node in the topo walk, but the structure must be
            // consistent.)

            nodes.push(IslandNode::Fetch(FetchIsland {
                target,
                paths: *paths,
            }));

            cfg.add_edge(fetch_node_id, node_id);

            edges.push(IslandEdge {
                source: fetch_node_id,
                target: node_id,
                kind: IslandEdgeKind::Data,
                paths: *paths,
            });
        }
    }
}

/// Finds the nearest dominating predecessor of `node` whose target matches `origin_target`.
///
/// Walks up the dominator tree from `node`, checking each ancestor. Returns the first
/// (nearest) node that runs on the requested backend.
fn find_nearest_provider(
    node: IslandNodeId,
    origin_target: TargetId,
    doms: &hashql_core::graph::algorithms::Dominators<IslandNodeId>,
    nodes: &IslandNodeSlice<IslandNode>,
    islands: &IslandSlice<Island>,
    cfg: &IslandCfg,
) -> Option<IslandNodeId> {
    let mut current = node;

    loop {
        let parent = doms.immediate_dominator(current)?;

        if parent == current {
            return None;
        }

        let parent_target = nodes[parent].target(islands);
        if parent_target == origin_target {
            return Some(parent);
        }

        current = parent;
    }
}

/// Adds a data edge carrying `path` from `source` to `target`, merging into existing edges.
fn add_data_edge(
    edges: &mut Vec<IslandEdge>,
    source: IslandNodeId,
    target: IslandNodeId,
    path: EntityPath,
) {
    use crate::pass::execution::traversal::EntityPath;

    let existing = edges.iter_mut().find(|edge| {
        edge.source == source && edge.target == target && edge.kind == IslandEdgeKind::Data
    });

    if let Some(edge) = existing {
        edge.paths.insert(path);
    } else {
        let mut paths = EntityPathBitSet::new_empty();
        paths.insert(path);
        edges.push(IslandEdge {
            source,
            target,
            kind: IslandEdgeKind::Data,
            paths,
        });
    }
}

/// Computes a topological schedule with level assignment for parallelism.
///
/// Each node is assigned the lowest level such that all its predecessors are at lower levels.
/// Nodes at the same level have no direct dependencies and can execute concurrently.
fn compute_schedule(
    nodes: &IslandNodeSlice<IslandNode>,
    edges: &[IslandEdge],
) -> Vec<ScheduledIsland> {
    let node_count = nodes.len();

    // Compute in-degree for each node.
    let mut in_degree = IslandNodeVec::from_fn_in(node_count, |_| 0u32, Global);
    let mut successors: IslandNodeVec<Vec<IslandNodeId>> =
        IslandNodeVec::from_fn_in(node_count, |_| Vec::new(), Global);

    for edge in edges {
        // Only count edges within the known node range (FetchIslands added later may
        // exceed the initial allocation).
        if edge.source.as_usize() < node_count && edge.target.as_usize() < node_count {
            in_degree[edge.target] += 1;
            if !successors[edge.source].contains(&edge.target) {
                successors[edge.source].push(edge.target);
            }
        }
    }

    let mut levels = IslandNodeVec::from_fn_in(node_count, |_| 0u32, Global);
    let mut queue: Vec<IslandNodeId> = Vec::new();

    // Seed the queue with nodes that have no predecessors.
    for node_id in (0..node_count).map(IslandNodeId::from_usize) {
        if in_degree[node_id] == 0 {
            queue.push(node_id);
        }
    }

    let mut schedule = Vec::with_capacity(node_count);
    let mut head = 0;

    while head < queue.len() {
        let node_id = queue[head];
        head += 1;

        schedule.push(ScheduledIsland {
            node: node_id,
            level: levels[node_id],
        });

        for &succ in &successors[node_id] {
            levels[succ] = levels[succ].max(levels[node_id] + 1);
            in_degree[succ] -= 1;
            if in_degree[succ] == 0 {
                queue.push(succ);
            }
        }
    }

    schedule
}

/// Builds the island dependency graph from placement results.
///
/// Takes the body CFG, the discovered islands, and produces a graph with:
/// - Real island nodes mapped 1:1 from the input islands
/// - FetchIsland nodes for unsatisfied data requirements
/// - CFG and data edges between nodes
/// - A topological schedule with parallelism levels
pub(crate) fn build_island_graph(
    body: &crate::body::Body<'_>,
    islands: &IslandVec<Island, impl Allocator>,
    vertex: VertexType,
) -> IslandGraph {
    use crate::body::basic_block::BasicBlockVec;

    let island_count = islands.len();

    // Map each basic block to its island's node ID.
    let mut block_to_island =
        BasicBlockVec::from_domain_in(IslandNodeId::new(0), &body.basic_blocks, Global);

    for island_id in islands.ids() {
        let node_id = IslandNodeId::from_usize(island_id.as_usize());
        for block in islands[island_id].iter() {
            block_to_island[block] = node_id;
        }
    }

    // Initialize nodes: one per real island.
    let mut nodes: IslandNodeVec<IslandNode> = IslandNodeVec::from_fn_in(
        island_count,
        |id| IslandNode::Real(IslandId::from_usize(id.as_usize())),
        Global,
    );

    let mut cfg = IslandCfg::new(island_count);
    let mut edges = Vec::new();

    // Phase 1: Build island-level CFG edges from block-level CFG.
    build_island_cfg(
        body,
        islands,
        &block_to_island,
        &mut cfg,
        &mut edges,
        &Global,
    );

    // Phase 2: Compute topological order for the forward walk.
    // Use reverse postorder (which is a valid topological order for DAGs).
    let topo_order = {
        use hashql_core::graph::Traverse as _;
        let rpo: Vec<IslandNodeId> = cfg
            .depth_first_traversal_post_order([IslandNodeId::new(0)])
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        rpo
    };

    // Phase 3: Resolve data requirements with dominance-aware provider search.
    resolve_requirements(
        islands,
        &mut nodes,
        &mut cfg,
        &mut edges,
        &topo_order,
        vertex,
    );

    // Phase 4: Compute the schedule with parallelism levels.
    let schedule = compute_schedule(&nodes, &edges);

    IslandGraph {
        nodes,
        edges,
        schedule,
    }
}
