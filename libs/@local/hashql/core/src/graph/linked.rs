//! Adjacency list graph implementation using intrusive linked lists.
//!
//! This module provides [`LinkedGraph`], a directed graph representation that stores
//! edges as intrusive linked lists. This allows O(1) edge insertion and efficient
//! iteration over incident edges without additional indirection.
//!
//! # Implementation Details
//!
//! Each node maintains two linked list heads (one for outgoing edges, one for incoming).
//! Each edge stores pointers to the next edge in both the source's outgoing list and
//! the target's incoming list, forming two independent linked lists per edge.
//!
//! This "intrusive" approach means edges are directly linked together rather than
//! referenced through an intermediate index structure.
//!
//! # Performance Characteristics
//!
//! - **Add node**: O(1)
//! - **Add edge**: O(1)
//! - **Query node/edge by ID**: O(1)
//! - **Iterate incident edges**: O(degree) with good cache locality
//! - **Space overhead**: 2 pointers per node + 2 pointers per edge
//!
//! # Examples
//!
//! ```rust
//! # use hashql_core::graph::{DirectedGraph, LinkedGraph, Successors};
//! #
//! let mut graph = LinkedGraph::new();
//!
//! // Add nodes with associated data
//! let alice = graph.add_node("Alice");
//! let bob = graph.add_node("Bob");
//! let carol = graph.add_node("Carol");
//!
//! // Add edges with associated data
//! graph.add_edge(alice, bob, "knows");
//! graph.add_edge(bob, carol, "knows");
//! graph.add_edge(alice, carol, "follows");
//!
//! // Query the graph
//! assert_eq!(graph.node_count(), 3);
//! assert_eq!(graph.edge_count(), 3);
//!
//! // Iterate over successors
//! let successors: Vec<_> = graph.successors(alice).collect();
//! # assert_eq!(successors, [carol, bob]);
//! ```

use alloc::alloc::Global;
use core::{alloc::Allocator, ops::Index};

use super::{
    DIRECTIONS, DirectedGraph, Direction, EdgeId, NodeId, Predecessors, Successors, Traverse,
};
use crate::id::{HasId, Id, IdSlice, IdVec};

/// Sentinel value indicating "no edge" in linked lists.
///
/// Uses the maximum [`EdgeId`] value, which can never be a valid edge ID since
/// edge insertion would overflow before reaching this value.
const TOMBSTONE: EdgeId = EdgeId(usize::MAX);

/// A node in a [`LinkedGraph`] with associated data.
///
/// Each node stores:
/// - Its unique identifier
/// - User-provided data of type `N`
/// - Two linked list heads (outgoing and incoming edges)
///
/// The `edges` array stores the head of each linked list, indexed by [`Direction`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Node<N> {
    /// Unique identifier for this node.
    id: NodeId,

    /// User-provided data associated with this node.
    pub data: N,

    /// Linked list heads: [outgoing, incoming].
    ///
    /// Each element is the [`EdgeId`] of the first edge in that direction's list,
    /// or [`TOMBSTONE`] if the list is empty.
    edges: [EdgeId; DIRECTIONS],
}

impl<N> HasId for Node<N> {
    type Id = NodeId;

    #[inline]
    fn id(&self) -> Self::Id {
        self.id
    }
}

/// A directed edge in a [`LinkedGraph`] connecting two nodes.
///
/// Each edge stores:
/// - Its unique identifier
/// - Source and target node identifiers
/// - User-provided data of type `E`
/// - Two "next" pointers for the intrusive linked lists
///
/// The edge participates in two separate linked lists simultaneously:
/// 1. The source node's outgoing edge list
/// 2. The target node's incoming edge list
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Edge<E> {
    /// Unique identifier for this edge.
    id: EdgeId,

    /// Source node (tail of the directed edge).
    source: NodeId,
    /// Target node (head of the directed edge).
    target: NodeId,

    /// User-provided data associated with this edge.
    pub data: E,

    /// Next edge pointers: [next in source's outgoing list, next in target's incoming list].
    ///
    /// These form the intrusive linked list structure. Each element is the [`EdgeId`]
    /// of the next edge in that list, or [`TOMBSTONE`] if this is the last edge.
    next: [EdgeId; DIRECTIONS],
}

impl<E> HasId for Edge<E> {
    type Id = EdgeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

impl<E> Edge<E> {
    /// Returns the source node of this edge.
    pub const fn source(&self) -> NodeId {
        self.source
    }

    /// Returns the target node of this edge.
    pub const fn target(&self) -> NodeId {
        self.target
    }

    /// Returns the node at the opposite end of this edge from the given direction.
    ///
    /// For an edge `u → v`:
    /// - If `direction` is [`Outgoing`], returns `v` (the target)
    /// - If `direction` is [`Incoming`], returns `u` (the source)
    ///
    /// This is useful when iterating edges in a specific direction and needing
    /// to find the "other" node.
    ///
    /// [`Outgoing`]: Direction::Outgoing
    /// [`Incoming`]: Direction::Incoming
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{Direction, LinkedGraph};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let source = graph.add_node("A");
    /// let target = graph.add_node("B");
    ///
    /// let edge_id = graph.add_edge(source, target, "edge");
    /// let edge = graph.edge(edge_id).expect("edge should exist");
    ///
    /// // For outgoing edge: opposite gives us the target
    /// assert_eq!(edge.opposite(Direction::Outgoing), target);
    ///
    /// // For incoming edge: opposite gives us the source
    /// assert_eq!(edge.opposite(Direction::Incoming), source);
    /// ```
    pub const fn opposite(&self, direction: Direction) -> NodeId {
        // Use integer comparison to make this const-compatible
        if (direction as usize) == (Direction::Outgoing as usize) {
            self.target
        } else {
            self.source
        }
    }
}

/// A directed graph implemented using intrusive linked lists for adjacency.
///
/// This structure provides an efficient representation for directed graphs where:
/// - Nodes can be added dynamically
/// - Edges can be added dynamically
/// - Incident edge iteration is frequent
/// - Node and edge data are arbitrary types
///
/// # Examples
///
/// ```rust
/// # use hashql_core::graph::LinkedGraph;
///
/// // Create a graph with string node data and integer edge weights
/// let mut graph: LinkedGraph<&str, i32> = LinkedGraph::new();
///
/// let start = graph.add_node("start");
/// let end = graph.add_node("end");
/// let edge = graph.add_edge(start, end, 42);
///
/// // Query by ID
/// if let Some(node) = graph.node(start) {
///     println!("Node data: {}", node.data);
///     # assert_eq!(node.data, "start");
/// }
/// # else { unreachable!() }
/// ```
#[derive(Debug, Clone)]
pub struct LinkedGraph<N, E, A: Allocator = Global> {
    /// All nodes in the graph, indexed by [`NodeId`].
    nodes: IdVec<NodeId, Node<N>, A>,
    /// All edges in the graph, indexed by [`EdgeId`].
    edges: IdVec<EdgeId, Edge<E>, A>,
}

impl<N, E> LinkedGraph<N, E> {
    /// Creates a new empty graph with the default global allocator.
    ///
    /// This is a convenience wrapper around [`new_in`] that uses [`Global`]
    /// as the allocator. For custom allocator support, use [`new_in`] directly.
    ///
    /// [`new_in`]: LinkedGraph::new_in
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, DirectedGraph as _};
    /// #
    /// let graph: LinkedGraph<&str, i32> = LinkedGraph::new();
    /// assert_eq!(graph.node_count(), 0);
    /// assert_eq!(graph.edge_count(), 0);
    /// ```
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        Self::new_in(Global)
    }
}

impl<N, E, A: Allocator> LinkedGraph<N, E, A> {
    /// Creates a new empty graph using the specified allocator.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, DirectedGraph as _};
    /// #
    /// let graph: LinkedGraph<&str, i32> = LinkedGraph::new();
    /// assert_eq!(graph.node_count(), 0);
    /// assert_eq!(graph.edge_count(), 0);
    /// ```
    #[inline]
    #[must_use]
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            nodes: IdVec::new_in(alloc.clone()),
            edges: IdVec::new_in(alloc),
        }
    }

    /// Adds a new node to the graph with the given data.
    ///
    /// Returns the [`NodeId`] of the newly created node. The node starts with
    /// no incident edges.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, DirectedGraph as _};
    /// # let mut graph = LinkedGraph::<_, ()>::new();
    /// let node = graph.add_node("data");
    /// assert_eq!(graph.node_count(), 1);
    /// ```
    pub fn add_node(&mut self, data: N) -> NodeId {
        self.nodes.push_with(|id| Node {
            id,
            data,
            // Start with empty edge lists
            edges: [TOMBSTONE; DIRECTIONS],
        })
    }

    /// Populates the graph with nodes derived from an existing indexed collection.
    ///
    /// For each element in `domain`, calls `data` to produce the node data and adds a
    /// corresponding node to the graph. The resulting [`NodeId`]s will have the same
    /// numeric values as the source collection's indices, enabling direct ID translation
    /// between the domain and the graph.
    ///
    /// # Panics
    ///
    /// Panics if the graph already contains nodes. This method is intended for initial
    /// population only.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::LinkedGraph;
    /// # use hashql_core::id::{Id, IdVec};
    /// #
    /// # hashql_core::id::newtype!(struct MyId(usize is 0..=usize::MAX));
    /// #
    /// let mut items: IdVec<MyId, &str> = IdVec::new();
    /// items.push("first");
    /// items.push("second");
    ///
    /// let mut graph: LinkedGraph<&str, ()> = LinkedGraph::new();
    /// graph.derive(&items, |_id, &value| value);
    ///
    /// // Node 0 corresponds to items[0], etc.
    /// assert_eq!(graph.nodes().len(), 2);
    /// ```
    pub fn derive<I, T>(&mut self, domain: &IdSlice<I, T>, mut data: impl FnMut(I, &T) -> N)
    where
        I: Id,
    {
        assert!(self.nodes.is_empty());

        self.nodes.raw.reserve(domain.len());

        for (id, item) in domain.iter_enumerated() {
            self.add_node(data(id, item));
        }
    }

    /// Returns a reference to the node with the given identifier.
    ///
    /// Returns [`None`] if no node exists with that identifier.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::LinkedGraph;
    /// # let mut graph = LinkedGraph::<_, ()>::new();
    /// let id = graph.add_node("A");
    ///
    /// assert_eq!(graph.node(id).map(|node| node.data), Some("A"));
    /// ```
    pub fn node(&self, id: NodeId) -> Option<&Node<N>> {
        self.nodes.get(id)
    }

    /// Returns a slice view of all nodes in the graph.
    ///
    /// Nodes are indexed by their [`NodeId`] and returned in insertion order.
    pub fn nodes(&self) -> &IdSlice<NodeId, Node<N>> {
        self.nodes.as_slice()
    }

    /// Adds a new directed edge to the graph.
    ///
    /// Creates an edge from `source` to `target` with the given data. The edge is
    /// inserted at the head of both the source's outgoing list and the target's
    /// incoming list, making insertion O(1).
    ///
    /// Returns the [`EdgeId`] of the newly created edge.
    ///
    /// # Panics
    ///
    /// Panics if `source` or `target` are not valid node identifiers in this graph.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, DirectedGraph as _};
    /// # let mut graph = LinkedGraph::new();
    /// # let n1 = graph.add_node("A");
    /// # let n2 = graph.add_node("B");
    /// let edge = graph.add_edge(n1, n2, "connects");
    ///
    /// assert_eq!(graph.edge_count(), 1);
    /// ```
    pub fn add_edge(&mut self, source: NodeId, target: NodeId, data: E) -> EdgeId {
        // Get current list heads for source's outgoing and target's incoming
        let source_outgoing = self.nodes[source].edges[Direction::Outgoing as usize];
        let target_incoming = self.nodes[target].edges[Direction::Incoming as usize];

        // Create new edge that points to the current list heads
        let edge_id = self.edges.push_with(|id| Edge {
            id,
            source,
            target,
            data,
            next: [source_outgoing, target_incoming],
        });

        // Update list heads to point to the new edge
        self.nodes[source].edges[Direction::Outgoing as usize] = edge_id;
        self.nodes[target].edges[Direction::Incoming as usize] = edge_id;

        edge_id
    }

    /// Returns a reference to the edge with the given identifier.
    ///
    /// Returns [`None`] if no edge exists with that identifier.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::LinkedGraph;
    /// # let mut graph = LinkedGraph::new();
    /// # let n1 = graph.add_node("A");
    /// # let n2 = graph.add_node("B");
    /// let edge = graph.add_edge(n1, n2, "A -> B");
    ///
    /// assert_eq!(graph.edge(edge).map(|edge| edge.data), Some("A -> B"));
    /// ```
    pub fn edge(&self, id: EdgeId) -> Option<&Edge<E>> {
        self.edges.get(id)
    }

    /// Returns a slice view of all edges in the graph.
    ///
    /// Edges are indexed by their [`EdgeId`] and returned in insertion order.
    pub fn edges(&self) -> &IdSlice<EdgeId, Edge<E>> {
        self.edges.as_slice()
    }

    /// Removes all edges from the graph while preserving nodes.
    pub fn clear_edges(&mut self) {
        self.edges.clear();
        for node in &mut self.nodes {
            node.edges = [TOMBSTONE; DIRECTIONS];
        }
    }

    /// Returns an iterator over edges incident to a node in the given direction.
    ///
    /// For [`Direction::Outgoing`], iterates edges where `node` is the source.
    /// For [`Direction::Incoming`], iterates edges where `node` is the target.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{Direction, LinkedGraph};
    /// #
    /// # let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// let n3 = graph.add_node("C");
    /// graph.add_edge(n1, n2, "edge1");
    /// graph.add_edge(n1, n3, "edge2");
    ///
    /// let outgoing: Vec<_> = graph.incident_edges(n1, Direction::Outgoing).collect();
    /// // Most recently added edge comes first (intrusive list)
    /// assert_eq!(outgoing[0].target(), n3);
    /// assert_eq!(outgoing[1].target(), n2);
    /// assert_eq!(outgoing.len(), 2);
    /// ```
    #[must_use]
    pub fn incident_edges(&self, node: NodeId, direction: Direction) -> IncidentEdges<'_, N, E, A> {
        IncidentEdges::new(self, direction, node)
    }

    /// Returns an iterator over edges incoming to the given node.
    ///
    /// Equivalent to `incident_edges(node, Direction::Incoming)`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::LinkedGraph;
    /// #
    /// # let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// let n3 = graph.add_node("C");
    /// graph.add_edge(n1, n3, "edge1");
    /// graph.add_edge(n2, n3, "edge2");
    ///
    /// let incoming: Vec<_> = graph.incoming_edges(n3).collect();
    /// // Most recently added edge comes first
    /// assert_eq!(incoming[0].source(), n2);
    /// assert_eq!(incoming[1].source(), n1);
    /// assert_eq!(incoming.len(), 2);
    /// ```
    #[must_use]
    pub fn incoming_edges(&self, node: NodeId) -> IncidentEdges<'_, N, E, A> {
        IncidentEdges::new(self, Direction::Incoming, node)
    }

    /// Returns an iterator over edges outgoing from the given node.
    ///
    /// Equivalent to `incident_edges(node, Direction::Outgoing)`.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::LinkedGraph;
    /// #
    /// # let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// let n3 = graph.add_node("C");
    /// graph.add_edge(n1, n2, "edge1");
    /// graph.add_edge(n1, n3, "edge2");
    ///
    /// let outgoing: Vec<_> = graph.outgoing_edges(n1).collect();
    /// // Most recently added edge comes first
    /// assert_eq!(outgoing[0].target(), n3);
    /// assert_eq!(outgoing[1].target(), n2);
    /// assert_eq!(outgoing.len(), 2);
    /// ```
    #[must_use]
    pub fn outgoing_edges(&self, node: NodeId) -> IncidentEdges<'_, N, E, A> {
        IncidentEdges::new(self, Direction::Outgoing, node)
    }

    /// Removes all nodes and edges from the graph.
    pub fn clear(&mut self) {
        self.nodes.clear();
        self.edges.clear();
    }
}

impl<N, E> Default for LinkedGraph<N, E> {
    fn default() -> Self {
        Self::new()
    }
}

impl<N, E, A: Allocator> Index<NodeId> for LinkedGraph<N, E, A> {
    type Output = Node<N>;

    fn index(&self, index: NodeId) -> &Self::Output {
        &self.nodes[index]
    }
}

impl<N, E, A: Allocator> Index<EdgeId> for LinkedGraph<N, E, A> {
    type Output = Edge<E>;

    fn index(&self, index: EdgeId) -> &Self::Output {
        &self.edges[index]
    }
}

impl<N, E, A: Allocator> DirectedGraph for LinkedGraph<N, E, A> {
    type Edge<'this>
        = &'this Edge<E>
    where
        Self: 'this;
    type EdgeId = EdgeId;
    type Node<'this>
        = &'this Node<N>
    where
        Self: 'this;
    type NodeId = NodeId;

    fn node_count(&self) -> usize {
        self.nodes.len()
    }

    fn edge_count(&self) -> usize {
        self.edges.len()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        self.nodes.iter()
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        self.edges.iter()
    }
}

impl<N, E, A: Allocator> Successors for LinkedGraph<N, E, A> {
    type SuccIter<'this>
        = impl Iterator<Item = NodeId>
    where
        Self: 'this;

    fn successors(&self, node: NodeId) -> Self::SuccIter<'_> {
        self.outgoing_edges(node).map(|edge| edge.target)
    }
}

impl<N, E, A: Allocator> Predecessors for LinkedGraph<N, E, A> {
    type PredIter<'this>
        = impl Iterator<Item = NodeId>
    where
        Self: 'this;

    fn predecessors(&self, node: NodeId) -> Self::PredIter<'_> {
        self.incoming_edges(node).map(|edge| edge.source)
    }
}

impl<N, E, A: Allocator> Traverse for LinkedGraph<N, E, A> {}

/// Iterator over edges incident to a node in a specific direction.
///
/// Created by [`LinkedGraph::incident_edges`], [`LinkedGraph::incoming_edges`],
/// or [`LinkedGraph::outgoing_edges`].
pub struct IncidentEdges<'graph, N, E, A: Allocator = Global> {
    /// Reference to the graph containing the edges.
    graph: &'graph LinkedGraph<N, E, A>,
    /// Direction being iterated (determines which `next` pointer to follow).
    direction: Direction,
    /// The next edge to yield, or [`TOMBSTONE`] if iteration is complete.
    next: EdgeId,
}

impl<'graph, N, E, A: Allocator> IncidentEdges<'graph, N, E, A> {
    /// Creates a new iterator over incident edges.
    ///
    /// Starts iteration from the head of the appropriate linked list for the given
    /// node and direction.
    fn new(graph: &'graph LinkedGraph<N, E, A>, direction: Direction, node: NodeId) -> Self {
        let next = graph.nodes[node].edges[direction as usize];
        Self {
            graph,
            direction,
            next,
        }
    }
}

impl<'graph, N, E, A: Allocator> Iterator for IncidentEdges<'graph, N, E, A> {
    type Item = &'graph Edge<E>;

    fn next(&mut self) -> Option<Self::Item> {
        // Check if we've reached the end of the list
        if self.next == TOMBSTONE {
            return None;
        }

        // Yield current edge and advance to next in the list
        let id = self.next;
        let edge = &self.graph.edges[id];
        self.next = edge.next[self.direction as usize];

        Some(edge)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        // Lower bound is 0 (could be at end), upper bound is total node count
        // (can't have more incident edges than nodes in the graph)
        (0, Some(self.graph.nodes.len()))
    }
}
