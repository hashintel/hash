//! Tarjan's algorithm for finding strongly connected components (SCCs) in directed graphs.
//!
//! This module implements an iterative version of Tarjan's algorithm that finds all strongly
//! connected components in a directed graph in linear time O(V + E). The algorithm performs
//! a single depth-first search while maintaining a stack of visited nodes to identify SCCs.
//!
//! The algorithm implemented is based on [Tarjan's algorithm](https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm).

#[cfg(test)]
mod tests;

use alloc::{alloc::Global, vec::Vec};
use core::{alloc::Allocator, iter, ops::Range, slice};

use crate::{
    collections::{FastHashSet, fast_hash_set_in},
    graph::{DirectedGraph, EdgeId, Successors},
    id::{HasId, Id, IdVec},
    newtype,
};

newtype!(struct DiscoveryTime(usize is 0..=usize::MAX));

/// Trait for attaching metadata to nodes and strongly connected components during traversal.
///
/// This trait allows tracking arbitrary information during Tarjan's algorithm execution.
/// Annotations are created for each node, merged when nodes are combined into SCCs,
/// and propagated along edges in the condensation graph.
///
/// Annotations should be for lightweight data, that can be easily merged and propagated, such as a
/// maximum value or a sum. When implemented the merge operations must be commutative, meaning that
/// `merge_into_scc(lhs, rhs) == merge_into_scc(rhs, lhs)`.
pub trait Metadata<N, S> {
    /// The type of annotation attached to nodes and SCCs.
    type Annotation;

    /// Creates an annotation for a single node when first visited.
    ///
    /// Called once per node during the initial DFS traversal.
    fn annotate_node(&mut self, node: N) -> Self::Annotation;

    /// Creates an annotation for a newly identified SCC.
    ///
    /// By default, uses the annotation of the SCC's root node. Override this
    /// to provide custom initialization logic based on the SCC identifier.
    #[expect(unused_variables, reason = "trait definition")]
    fn annotate_scc(&mut self, scc: S, root: N) -> Self::Annotation {
        self.annotate_node(root)
    }

    /// Merges a node's annotation into its containing SCC's annotation.
    ///
    /// Called once for each node in an SCC, accumulating their individual
    /// annotations into the SCC's final annotation.
    fn merge_into_scc(&mut self, lhs: &mut Self::Annotation, other: Self::Annotation);

    /// Propagates annotation data from a reachable SCC to its predecessor.
    ///
    /// Called for each edge in the condensation graph, allowing SCCs to
    /// accumulate information from their successors.
    fn merge_reachable(&mut self, lhs: &mut Self::Annotation, other: &Self::Annotation);
}

impl<N, S> Metadata<N, S> for () {
    type Annotation = ();

    fn annotate_node(&mut self, _: N) -> Self::Annotation {}

    fn merge_into_scc(&mut self, (): &mut (), (): ()) {}

    fn merge_reachable(&mut self, (): &mut (), (): &()) {}
}

/// Represents the state of a node during Tarjan's algorithm execution.
#[derive(Debug, Clone)]
enum NodeState<S, A> {
    /// Node hasn't been visited by the DFS yet.
    Unvisited,

    /// Node is currently being explored (on the DFS path).
    ///
    /// Active nodes may still be part of an incomplete SCC. The low-link value
    /// tracks the earliest node reachable from this node through back edges.
    OnStack {
        /// Discovery time when this node was first visited.
        index: DiscoveryTime,
        /// Smallest index reachable from this node.
        low_link: DiscoveryTime,
        /// Range in the successor stack containing this node's outgoing edges.
        successors: Range<usize>,
        /// Metadata annotation for this node.
        annotation: A,
    },

    /// Node has been assigned to a finalized SCC.
    ///
    /// Once a node is in this state, its SCC membership cannot change.
    InComponent {
        /// The SCC this node belongs to.
        id: S,
    },
}

impl<S, A> NodeState<S, A> {
    /// Returns the low-link value if the node is currently being explored.
    ///
    /// Returns [`None`] for unvisited nodes or nodes already assigned to an SCC.
    const fn low_link(&self) -> Option<DiscoveryTime> {
        match self {
            Self::OnStack { low_link, .. } => Some(*low_link),
            Self::Unvisited | Self::InComponent { .. } => None,
        }
    }

    /// Updates the low-link value to the minimum of current and `new_low`.
    ///
    /// Only has an effect if the node is in the [`OnStack`] state and `new_low`
    /// is smaller than the current low-link value.
    ///
    /// [`OnStack`]: NodeState::OnStack
    fn update_low_link(&mut self, new_low: DiscoveryTime) {
        if let Self::OnStack { low_link, .. } = self
            && new_low.as_usize() < low_link.as_usize()
        {
            *low_link = new_low;
        }
    }
}

/// Represents a frame in the iterative DFS traversal stack.
///
/// Each frame corresponds to a recursive call in the traditional recursive formulation of Tarjan's
/// algorithm. The iterative approach avoids stack overflow on deep graphs.
#[derive(Debug, Clone)]
struct DfsFrame<N> {
    /// The node being explored in this frame.
    node: N,
    /// Index of the next successor to process (into the `successor_stack`).
    successor_index: usize,
}

/// Data for a single strongly connected component.
struct Component<A> {
    /// Metadata annotation for this SCC.
    annotation: A,
    /// Range in the successor list containing outgoing edges from this SCC.
    successors: Range<usize>,
}

/// Storage for the computed SCCs and their relationships.
///
/// Intentionally opaque to avoid exposing internal details.
struct Data<N, S, M, A: Allocator = Global> {
    /// All identified SCCs with their metadata and successor ranges.
    components: IdVec<S, Component<M>, A>,
    /// Flattened list of successor SCC IDs for all components.
    successors: Vec<S, A>,
    /// Maps each original node to its containing SCC.
    nodes: IdVec<N, S, A>,
}

/// Result of running Tarjan's algorithm: the condensation graph of SCCs.
///
/// This structure represents a directed acyclic graph (DAG) where each node is a strongly
/// connected component from the original graph. Two SCCs are connected if there was an
/// edge between any of their constituent nodes in the original graph.
pub struct StronglyConnectedComponents<N, S, M: Metadata<N, S> = (), A: Allocator = Global> {
    /// Metadata tracker used during construction.
    pub metadata: M,

    data: Data<N, S, M::Annotation, A>,
}

impl<N, S, M, A: Allocator> StronglyConnectedComponents<N, S, M, A>
where
    N: Id,
    S: Id,
    M: Metadata<N, S>,
{
    /// Returns the SCC identifier containing the given node.
    pub fn scc(&self, node: N) -> S {
        self.data.nodes[node]
    }

    /// Returns the metadata annotation for the given SCC.
    pub fn annotation(&self, scc: S) -> &M::Annotation {
        &self.data.components[scc].annotation
    }
}

impl<N, S, M, A: Allocator> DirectedGraph for StronglyConnectedComponents<N, S, M, A>
where
    S: Id + HasId<Id = S>,
    M: Metadata<N, S>,
{
    type Edge<'this>
        = EdgeId
    where
        Self: 'this;
    type EdgeId = EdgeId;
    type Node<'this>
        = S
    where
        Self: 'this;
    type NodeId = S;

    fn node_count(&self) -> usize {
        self.data.components.len()
    }

    fn edge_count(&self) -> usize {
        self.data.successors.len()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        (0..self.node_count()).map(S::from_usize)
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        (0..self.edge_count()).map(EdgeId::new)
    }
}

impl<N, S, M, A: Allocator> Successors for StronglyConnectedComponents<N, S, M, A>
where
    S: Id + HasId<Id = S>,
    M: Metadata<N, S>,
{
    type SuccIter<'this>
        = iter::Copied<slice::Iter<'this, S>>
    where
        Self: 'this;

    fn successors(&self, node: S) -> Self::SuccIter<'_> {
        let range = self.data.components[node].successors.clone();

        self.data.successors[range].iter().copied()
    }
}

/// Tarjan's algorithm implementation for finding strongly connected components.
///
/// This structure maintains all the state needed during the algorithm's execution.
/// Use [`Tarjan::new`] to create an instance, then call [`Tarjan::run`] to execute
/// the algorithm and produce the result.
///
/// # Algorithm Complexity
///
/// - **Time**: O(V + E) where V is nodes and E is edges
/// - **Space**: O(V) for the various stacks and state tracking
pub struct Tarjan<'graph, G, N, S, M: Metadata<N, S> = (), A: Allocator = Global> {
    /// Reference to the input graph.
    graph: &'graph G,
    /// Metadata tracker for annotations.
    metadata: M,

    /// Current state of each node in the algorithm.
    node_state: IdVec<N, NodeState<S, M::Annotation>, A>,
    /// Stack of DFS frames for iterative traversal.
    dfs_stack: Vec<DfsFrame<N>, A>,
    /// Stack of nodes in the current DFS path (potential SCC members).
    scc_stack: Vec<N, A>,
    /// Flattened storage for all node successors during traversal.
    successor_stack: Vec<N, A>,
    /// Temporary set for deduplicating SCC successors.
    deduplicated_successors: FastHashSet<S, A>,

    /// Counter for assigning discovery times to nodes.
    discovery_time: DiscoveryTime,

    /// Output data being constructed.
    data: Data<N, S, M::Annotation, A>,
}

impl<'graph, G, N, S> Tarjan<'graph, G, N, S>
where
    G: DirectedGraph<NodeId = N> + Successors,
    N: Id,
    S: Id,
{
    /// Creates a new Tarjan's algorithm instance with the default allocator.
    #[inline]
    pub fn new(graph: &'graph G) -> Self {
        Self::new_in(graph, Global)
    }
}

impl<'graph, G, N, S, M> Tarjan<'graph, G, N, S, M>
where
    G: DirectedGraph<NodeId = N> + Successors,
    N: Id,
    S: Id,
    M: Metadata<N, S>,
{
    /// Creates a new Tarjan's algorithm instance with custom metadata.
    #[inline]
    pub fn new_with_metadata(graph: &'graph G, metadata: M) -> Self {
        Self::new_with_metadata_in(graph, metadata, Global)
    }
}

impl<'graph, G, N, S, A> Tarjan<'graph, G, N, S, (), A>
where
    G: DirectedGraph<NodeId = N> + Successors,
    N: Id,
    S: Id,
    A: Allocator + Clone,
{
    /// Creates a new Tarjan's algorithm instance with a custom allocator.
    #[inline]
    pub fn new_in(graph: &'graph G, alloc: A) -> Self {
        Self::new_with_metadata_in(graph, (), alloc)
    }
}

impl<'graph, G, N, S, M, A> Tarjan<'graph, G, N, S, M, A>
where
    G: DirectedGraph<NodeId = N> + Successors,
    N: Id,
    S: Id,
    M: Metadata<N, S>,
    A: Allocator + Clone,
{
    /// Creates a new Tarjan's algorithm instance with custom metadata and allocator.
    pub fn new_with_metadata_in(graph: &'graph G, metadata: M, alloc: A) -> Self {
        let node_count = graph.node_count();

        Self {
            graph,
            metadata,

            // All nodes start in an unvisited state
            node_state: IdVec::from_fn_in(node_count, |_| NodeState::Unvisited, alloc.clone()),

            dfs_stack: Vec::new_in(alloc.clone()),
            scc_stack: Vec::new_in(alloc.clone()),
            successor_stack: Vec::new_in(alloc.clone()),
            deduplicated_successors: fast_hash_set_in(None, alloc.clone()),

            discovery_time: DiscoveryTime::MIN,
            data: Data {
                components: IdVec::new_in(alloc.clone()),
                successors: Vec::new_in(alloc.clone()),
                // Initialize all nodes to S::MAX (unassigned)
                nodes: IdVec::from_fn_in(node_count, |_| S::MAX, alloc),
            },
        }
    }

    /// Executes Tarjan's algorithm and returns the condensation graph.
    ///
    /// This consumes the [`Tarjan`] instance and returns a [`StronglyConnectedComponents`]
    /// structure representing the DAG of SCCs.
    pub fn run(mut self) -> StronglyConnectedComponents<N, S, M, A> {
        // Explore from each unvisited node to handle disconnected components
        for node in self.graph.iter_nodes() {
            let id = node.id();

            if matches!(self.node_state[id], NodeState::Unvisited) {
                self.explore_from(id);
            }
        }

        StronglyConnectedComponents {
            data: self.data,
            metadata: self.metadata,
        }
    }

    /// Begins DFS exploration from a newly discovered node.
    ///
    /// This method:
    /// 1. Assigns a discovery time to the node
    /// 2. Pushes the node onto the SCC stack
    /// 3. Creates a DFS frame with the node's successors
    /// 4. Transitions the node to the `OnStack` state
    fn start_exploration(&mut self, node: N) {
        // Assign discovery time and increment for the next node
        let index = self.discovery_time;
        self.discovery_time.increment_by(1);

        // Node is now a candidate for an SCC
        self.scc_stack.push(node);

        // Store successors in the successor stack for processing
        let successors_start = self.successor_stack.len();

        let frame = DfsFrame {
            node,
            successor_index: successors_start,
        };

        self.successor_stack.extend(self.graph.successors(node));
        let successors_end = self.successor_stack.len();

        // Transition to OnStack with initial low-link equal to index
        self.node_state[node] = NodeState::OnStack {
            index,
            low_link: index,
            successors: successors_start..successors_end,
            annotation: self.metadata.annotate_node(node),
        };

        self.dfs_stack.push(frame);
    }

    /// Performs iterative DFS starting from the given node.
    ///
    /// This is the main loop of Tarjan's algorithm. It processes the DFS stack
    /// iteratively, avoiding the stack overflow issues of recursive implementations.
    fn explore_from(&mut self, start_node: N) {
        debug_assert!(self.dfs_stack.is_empty());

        self.start_exploration(start_node);

        // Main DFS loop: process frames until the stack is empty
        while let Some(frame) = self.dfs_stack.last_mut() {
            let current_node = frame.node;
            let NodeState::OnStack { successors, .. } = &self.node_state[current_node] else {
                unreachable!("Node state should be OnStack during exploration")
            };
            let successors_range = successors.clone();

            // Check if there are more successors to process
            if frame.successor_index < successors_range.end {
                let successor = self.successor_stack[frame.successor_index];
                frame.successor_index += 1;

                match &self.node_state[successor] {
                    NodeState::Unvisited => {
                        // Tree edge: recursively visit this successor
                        self.start_exploration(successor);
                    }
                    &NodeState::OnStack {
                        index: succ_index, ..
                    } => {
                        // Back edge: successor is in the current DFS path
                        // Update low-link to reflect this connection
                        self.node_state[current_node].update_low_link(succ_index);
                    }
                    NodeState::InComponent { .. } => {
                        // Cross edge or forward edge: successor already finalized
                        // No impact on low-link calculation
                    }
                }
            } else {
                // All successors processed: backtrack
                self.dfs_stack.pop();

                // Propagate low-link value to parent in DFS tree
                if let Some(parent_frame) = self.dfs_stack.last()
                    && let Some(current_low) = self.node_state[current_node].low_link()
                {
                    self.node_state[parent_frame.node].update_low_link(current_low);
                }

                // Check if this node is the root of an SCC
                let NodeState::OnStack {
                    index, low_link, ..
                } = self.node_state[current_node]
                else {
                    unreachable!("NodeState should be OnStack");
                };

                if index == low_link {
                    // This node is an SCC root: finalize the component
                    self.finalize_scc(current_node);
                }
            }
        }
    }

    /// Finalizes an SCC by popping all its members from the SCC stack.
    ///
    /// This method:
    /// 1. Creates a new SCC with an ID
    /// 2. Pops nodes from the SCC stack until reaching the root
    /// 3. Merges node annotations into the SCC's annotation
    /// 4. Computes deduplicated successor SCCs
    /// 5. Propagates metadata along edges to successor SCCs
    fn finalize_scc(&mut self, root: N) {
        // Create a new SCC component
        let scc_id = self.data.components.push_with(|id| Component {
            annotation: self.metadata.annotate_scc(id, root),
            successors: self.data.successors.len()..self.data.successors.len(),
        });

        // Pop all nodes in this SCC from the stack
        loop {
            let node = self.scc_stack.pop().expect("SCC stack should not be empty");
            self.data.nodes[node] = scc_id;

            // Extract node data and transition to InComponent state
            let NodeState::OnStack {
                annotation,
                successors,
                ..
            } = core::mem::replace(
                &mut self.node_state[node],
                NodeState::InComponent { id: scc_id },
            )
            else {
                unreachable!("nodes on the SCC stack should be OnStack");
            };

            // Merge this node's annotation into the SCC's annotation
            self.metadata
                .merge_into_scc(&mut self.data.components[scc_id].annotation, annotation);

            // Process edges from this node to collect SCC successors
            for &successor in &self.successor_stack[successors.clone()] {
                // Only consider edges to different, finalized SCCs
                if let NodeState::InComponent { id: target_scc_id } = self.node_state[successor]
                    && target_scc_id != scc_id
                    && self.deduplicated_successors.insert(target_scc_id)
                {
                    // Get mutable access to both SCCs for metadata propagation
                    let [scc, target] = self
                        .data
                        .components
                        .get_disjoint_mut([scc_id, target_scc_id])
                        .unwrap_or_else(|_err| {
                            unreachable!("scc_id != target_scc_id verified above")
                        });

                    // Propagate metadata from target to source
                    self.metadata
                        .merge_reachable(&mut scc.annotation, &target.annotation);
                }
            }

            // Clean up processed successors
            self.successor_stack.truncate(successors.start);

            // Stop when we've processed the root
            if node == root {
                break;
            }
        }

        // Finalize the SCC's successor list
        let successor_len = self.data.successors.len();
        self.data
            .successors
            .extend(self.deduplicated_successors.drain());
        // Sort for deterministic output
        self.data.successors[successor_len..].sort_unstable();

        self.data.components[scc_id].successors.end = self.data.successors.len();
    }
}
