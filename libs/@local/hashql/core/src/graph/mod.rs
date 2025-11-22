//! Graph data structures and algorithms.
//!
//! This module provides traits and types for working with directed graphs, along with
//! common graph algorithms like traversals and strongly connected components.
//!
//! # Core Traits
//!
//! - [`DirectedGraph`]: Base trait for directed graphs with nodes and edges
//! - [`Successors`]: Trait for graphs that can enumerate outgoing edges
//! - [`Predecessors`]: Trait for graphs that can enumerate incoming edges
//! - [`Traverse`]: Convenience trait providing depth-first and breadth-first traversals
//!
//! # Implementations
//!
//! - [`LinkedGraph`]: Adjacency list implementation using intrusive linked lists
//!
//! # Examples
//!
//! ```rust
//! # use hashql_core::graph::{DirectedGraph, LinkedGraph};
//! #
//! let mut graph = LinkedGraph::new();
//! let n1 = graph.add_node("A");
//! let n2 = graph.add_node("B");
//! let e = graph.add_edge(n1, n2, "edge");
//!
//! assert_eq!(graph.node_count(), 2);
//! assert_eq!(graph.edge_count(), 1);
//! ```

use self::algorithms::{BreadthFirstTraversal, DepthFirstTraversal};
pub use self::linked::LinkedGraph;
use crate::id::{HasId, Id, newtype};

pub mod algorithms;
pub mod linked;
#[cfg(test)]
mod tests;

newtype!(pub struct NodeId(usize is 0..=usize::MAX));
newtype!(pub struct EdgeId(usize is 0..=usize::MAX));

/// Direction of edge traversal in a directed graph.
///
/// Used to distinguish between outgoing edges (from a node) and incoming edges (to a node).
/// The discriminant values are used as array indices in some implementations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Direction {
    /// Edges going out from a node (source -> target).
    Outgoing = 0,
    /// Edges coming into a node (source -> target).
    Incoming = 1,
}

/// Number of direction variants, used for sizing fixed arrays.
pub(crate) const DIRECTIONS: usize = core::mem::variant_count::<Direction>();

/// Base trait for directed graphs.
///
/// This trait provides the fundamental interface that all directed graph implementations
/// must support. Graphs consist of nodes connected by directed edges, where each node
/// and edge has an associated identifier and can carry arbitrary data.
///
/// # Associated Types
///
/// The trait is highly generic to support different graph representations:
/// - Node and edge identifiers can be different types
/// - Node and edge data can be borrowed or owned depending on the implementation
///
/// # Examples
///
/// ```rust
/// use hashql_core::graph::{DirectedGraph, LinkedGraph};
///
/// fn count_elements(graph: &impl DirectedGraph) {
///     println!(
///         "Nodes: {}, Edges: {}",
///         graph.node_count(),
///         graph.edge_count()
///     );
/// }
/// ```
pub trait DirectedGraph {
    /// Type of node identifiers.
    type NodeId: Id;

    /// Type of node references returned by iterators.
    ///
    /// This is typically `&Node` or a wrapper type that implements [`HasId`].
    type Node<'this>: HasId<Id = Self::NodeId>
    where
        Self: 'this;

    /// Type of edge identifiers.
    type EdgeId: Id;

    /// Type of edge references returned by iterators.
    ///
    /// This is typically `&Edge` or a wrapper type that implements [`HasId`].
    type Edge<'this>: HasId<Id = Self::EdgeId>
    where
        Self: 'this;

    /// Returns the number of nodes in the graph.
    fn node_count(&self) -> usize;

    /// Returns the number of edges in the graph.
    fn edge_count(&self) -> usize;

    /// Returns an iterator over all nodes in the graph.
    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator;

    /// Returns an iterator over all edges in the graph.
    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator;
}

/// Trait for graphs that can enumerate outgoing edges (successors) from a node.
///
/// A successor of node `u` is any node `v` such that there exists an edge `u -> v`.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::graph::{LinkedGraph, Successors};
/// #
/// let mut graph = LinkedGraph::new();
/// let n1 = graph.add_node("A");
/// let n2 = graph.add_node("B");
/// let n3 = graph.add_node("C");
/// graph.add_edge(n1, n2, "edge1");
/// graph.add_edge(n1, n3, "edge2");
///
/// let successors: Vec<_> = graph.successors(n1).collect();
/// # assert_eq!(successors, [n3, n2]);
/// ```
pub trait Successors: DirectedGraph {
    /// Iterator type that yields successor node identifiers.
    type SuccIter<'this>: Iterator<Item = Self::NodeId>
    where
        Self: 'this;

    /// Returns an iterator over the successors of the given node.
    ///
    /// Each yielded identifier corresponds to the target of an outgoing edge from `node`.
    fn successors(&self, node: Self::NodeId) -> Self::SuccIter<'_>;
}

/// Trait for graphs that can enumerate incoming edges (predecessors) to a node.
///
/// A predecessor of node `v` is any node `u` such that there exists an edge `u -> v`.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::graph::{LinkedGraph, Predecessors};
/// #
/// let mut graph = LinkedGraph::new();
/// let n1 = graph.add_node("A");
/// let n2 = graph.add_node("B");
/// let n3 = graph.add_node("C");
/// graph.add_edge(n1, n3, "edge1");
/// graph.add_edge(n2, n3, "edge2");
///
/// let predecessors: Vec<_> = graph.predecessors(n3).collect();
/// # assert_eq!(predecessors, vec![n2, n1]);
/// ```
pub trait Predecessors: DirectedGraph {
    /// Iterator type that yields predecessor node identifiers.
    type PredIter<'this>: Iterator<Item = Self::NodeId>
    where
        Self: 'this;

    /// Returns an iterator over the predecessors of the given node.
    ///
    /// Each yielded identifier corresponds to the source of an incoming edge to `node`.
    fn predecessors(&self, node: Self::NodeId) -> Self::PredIter<'_>;
}

/// Convenience trait providing graph traversal methods.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::graph::{LinkedGraph, Traverse};
/// #
/// let mut graph = LinkedGraph::new();
/// let n1 = graph.add_node("A");
/// let n2 = graph.add_node("B");
/// let n3 = graph.add_node("C");
/// graph.add_edge(n1, n2, ());
/// graph.add_edge(n2, n3, ());
///
/// let visited: Vec<_> = graph.depth_first_traversal([n1]).collect();
/// # assert_eq!(visited, [n1, n2, n3]);
/// ```
pub trait Traverse: DirectedGraph + Successors {
    /// Performs a depth-first traversal starting from the given nodes.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, Traverse};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// graph.add_edge(n1, n2, ());
    ///
    /// // Single starting node
    /// let visited: Vec<_> = graph.depth_first_traversal([n1]).collect();
    /// assert_eq!(visited, [n1, n2]);
    ///
    /// // Multiple disconnected starting nodes
    /// let n3 = graph.add_node("C");
    ///
    /// let all_visited: Vec<_> = graph.depth_first_traversal([n1, n3]).collect();
    /// assert_eq!(all_visited, [n3, n1, n2]);
    /// ```
    fn depth_first_traversal(
        &self,
        start: impl IntoIterator<Item = Self::NodeId>,
    ) -> impl Iterator<Item = Self::NodeId> {
        let mut traversal = DepthFirstTraversal::new(self);

        for start in start {
            traversal.push_start_node(start);
        }

        traversal
    }

    /// Performs a breadth-first traversal starting from the given nodes.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, Traverse};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// let n3 = graph.add_node("C");
    /// let n4 = graph.add_node("D");
    /// graph.add_edge(n1, n2, ());
    /// graph.add_edge(n1, n3, ());
    /// graph.add_edge(n2, n4, ());
    ///
    /// // Single starting node - visits level-by-level
    /// let visited: Vec<_> = graph.breadth_first_traversal([n1]).collect();
    /// assert_eq!(visited, [n1, n3, n2, n4]);
    ///
    /// // Multiple disconnected starting nodes
    /// let n5 = graph.add_node("E");
    ///
    /// let all_visited: Vec<_> = graph.breadth_first_traversal([n1, n5]).collect();
    /// assert_eq!(all_visited, [n1, n5, n3, n2, n4]);
    /// ```
    fn breadth_first_traversal(
        &self,
        node: impl IntoIterator<Item = Self::NodeId>,
    ) -> impl Iterator<Item = Self::NodeId> {
        let mut traversal = BreadthFirstTraversal::new(self);

        for start in node {
            traversal.push_start_node(start);
        }

        traversal
    }
}
