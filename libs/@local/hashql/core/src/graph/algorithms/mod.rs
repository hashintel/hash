//! Graph traversal algorithms.
//!
//! This module provides standard graph traversal algorithms including depth-first
//! and breadth-first search. All traversals are implemented as lazy iterators that
//! track visited nodes to avoid cycles.
//!
//! # Examples
//!
//! ```rust
//! # use hashql_core::graph::{LinkedGraph, algorithms::{DepthFirstTraversal, BreadthFirstTraversal}};
//! #
//! let mut graph = LinkedGraph::new();
//! let n1 = graph.add_node("A");
//! let n2 = graph.add_node("B");
//! graph.add_edge(n1, n2, ());
//!
//! // Depth-first traversal
//! let dfs = DepthFirstTraversal::with_start_node(&graph, n1);
//! let visited: Vec<_> = dfs.collect();
//! # assert_eq!(visited, vec![n1, n2]);
//!
//! // Breadth-first traversal
//! let bfs = BreadthFirstTraversal::with_start_node(&graph, n1);
//! let visited: Vec<_> = bfs.collect();
//! # assert_eq!(visited, vec![n1, n2]);
//! ```

pub mod tarjan;

use alloc::collections::VecDeque;

pub use self::tarjan::Tarjan;
use super::{DirectedGraph, Successors};
use crate::id::{Id, bit_vec::MixedBitSet};

/// Iterator for depth-first traversal of a directed graph.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversal};
/// #
/// let mut graph = LinkedGraph::new();
/// let n1 = graph.add_node("A");
/// let n2 = graph.add_node("B");
/// let n3 = graph.add_node("C");
/// graph.add_edge(n1, n2, ());
/// graph.add_edge(n2, n3, ());
///
/// let traversal = DepthFirstTraversal::with_start_node(&graph, n1);
/// let visited: Vec<_> = traversal.collect();
/// # assert_eq!(visited, [n1, n2, n3]);
/// ```
pub struct DepthFirstTraversal<'graph, G: ?Sized, N> {
    graph: &'graph G,
    stack: Vec<N>,
    visited: MixedBitSet<N>,
}

impl<'graph, G: ?Sized, N> DepthFirstTraversal<'graph, G, N>
where
    N: Id,
{
    /// Creates a new depth-first traversal with no starting nodes.
    ///
    /// Use [`push_start_node`] to add starting nodes before iteration.
    ///
    /// [`push_start_node`]: DepthFirstTraversal::push_start_node
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversal};
    /// #
    /// let graph = LinkedGraph::<&str, ()>::new();
    /// let traversal = DepthFirstTraversal::new(&graph);
    ///
    /// let visited: Vec<_> = traversal.collect();
    /// # assert_eq!(visited, []);
    /// ```
    pub fn new(graph: &'graph G) -> Self
    where
        G: DirectedGraph<NodeId = N>,
    {
        DepthFirstTraversal {
            graph,
            stack: Vec::new(),
            visited: MixedBitSet::new_empty(graph.node_count()),
        }
    }

    /// Creates a new depth-first traversal starting from the given node.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversal};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// graph.add_edge(n1, n2, ());
    ///
    /// let traversal = DepthFirstTraversal::with_start_node(&graph, n1);
    /// let visited: Vec<_> = traversal.collect();
    /// # assert_eq!(visited, [n1, n2]);
    /// ```
    pub fn with_start_node(graph: &'graph G, start_node: N) -> Self
    where
        G: DirectedGraph<NodeId = N>,
    {
        let mut traversal = DepthFirstTraversal::new(graph);
        traversal.stack.push(start_node);
        traversal
    }

    /// Adds a starting node to the traversal.
    ///
    /// If the node has already been visited, this has no effect. This allows
    /// traversing disconnected components by adding multiple starting nodes.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversal};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// let n3 = graph.add_node("C");
    /// graph.add_edge(n1, n2, ());
    /// // n3 is disconnected
    ///
    /// let mut traversal = DepthFirstTraversal::new(&graph);
    /// traversal.push_start_node(n1);
    /// traversal.push_start_node(n3);
    ///
    /// let visited: Vec<_> = traversal.collect();
    /// # assert_eq!(visited, [n3, n1, n2]);
    /// ```
    pub fn push_start_node(&mut self, start_node: N)
    where
        G: DirectedGraph<NodeId = N>,
    {
        if self.visited.insert(start_node) {
            self.stack.push(start_node);
        }
    }

    /// Returns whether the given node has been visited.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversal};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// graph.add_edge(n1, n2, ());
    ///
    /// let mut traversal = DepthFirstTraversal::with_start_node(&graph, n1);
    ///
    /// assert!(!traversal.visited(n2)); // Not yet visited
    /// traversal.next(); // Visit n1
    /// assert!(traversal.visited(n2)); // Now visited (inside of queue)
    /// ```
    pub fn visited(&self, node: N) -> bool {
        self.visited.contains(node)
    }
}

impl<G: DirectedGraph<NodeId = N> + Successors + ?Sized, N> Iterator
    for DepthFirstTraversal<'_, G, N>
where
    N: Id,
{
    type Item = N;

    fn next(&mut self) -> Option<Self::Item> {
        let next = self.stack.pop()?;

        self.stack.extend(
            self.graph
                .successors(next)
                .filter(|&id| self.visited.insert(id)),
        );

        Some(next)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.graph.node_count() - self.visited.count();

        // Lower bound: at least the nodes currently in the stack
        // Upper bound: could visit up to all remaining unvisited nodes
        // Note: Due to disconnected components, we may not visit all nodes
        (self.stack.len(), Some(remaining))
    }
}

/// Iterator for breadth-first traversal of a directed graph.
///
/// # Examples
///
/// ```rust
/// # use hashql_core::graph::{LinkedGraph, algorithms::BreadthFirstTraversal};
/// #
/// let mut graph = LinkedGraph::new();
/// let n1 = graph.add_node("root");
/// let n2 = graph.add_node("child1");
/// let n3 = graph.add_node("child2");
/// graph.add_edge(n1, n2, ());
/// graph.add_edge(n1, n3, ());
///
/// let traversal = BreadthFirstTraversal::with_start_node(&graph, n1);
/// let visited: Vec<_> = traversal.collect();
/// // Root is visited first, then its children
/// # assert_eq!(visited[0], n1);
/// # assert!(visited.contains(&n2) && visited.contains(&n3));
/// ```
pub struct BreadthFirstTraversal<'graph, G: ?Sized, N> {
    graph: &'graph G,
    queue: VecDeque<N>,
    visited: MixedBitSet<N>,
}

impl<'graph, G: ?Sized, N> BreadthFirstTraversal<'graph, G, N>
where
    N: Id,
{
    /// Creates a new breadth-first traversal with no starting nodes.
    ///
    /// Use [`push_start_node`] to add starting nodes before iteration.
    ///
    /// [`push_start_node`]: BreadthFirstTraversal::push_start_node
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::BreadthFirstTraversal};
    /// #
    /// let graph = LinkedGraph::<&str, ()>::new();
    /// let traversal = BreadthFirstTraversal::new(&graph);
    ///
    /// let visited: Vec<_> = traversal.collect();
    /// # assert_eq!(visited, vec![]);
    /// ```
    pub fn new(graph: &'graph G) -> Self
    where
        G: DirectedGraph<NodeId = N>,
    {
        BreadthFirstTraversal {
            graph,
            queue: VecDeque::new(),
            visited: MixedBitSet::new_empty(graph.node_count()),
        }
    }

    /// Creates a new breadth-first traversal starting from the given node.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::BreadthFirstTraversal};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// graph.add_edge(n1, n2, ());
    ///
    /// let traversal = BreadthFirstTraversal::with_start_node(&graph, n1);
    /// let visited: Vec<_> = traversal.collect();
    /// # assert_eq!(visited, vec![n1, n2]);
    /// ```
    pub fn with_start_node(graph: &'graph G, start_node: N) -> Self
    where
        G: DirectedGraph<NodeId = N>,
    {
        let mut traversal = BreadthFirstTraversal::new(graph);
        traversal.queue.push_back(start_node);
        traversal
    }

    /// Adds a starting node to the traversal.
    ///
    /// If the node has already been visited, this has no effect. This allows
    /// traversing disconnected components by adding multiple starting nodes.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::BreadthFirstTraversal};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// let n3 = graph.add_node("C");
    /// graph.add_edge(n1, n2, ());
    /// // n3 is disconnected
    ///
    /// let mut traversal = BreadthFirstTraversal::new(&graph);
    /// traversal.push_start_node(n1);
    /// traversal.push_start_node(n3);
    ///
    /// let visited: Vec<_> = traversal.collect();
    /// # assert_eq!(visited, vec![n1, n3, n2]);
    /// ```
    pub fn push_start_node(&mut self, start_node: N)
    where
        G: DirectedGraph<NodeId = N>,
    {
        if self.visited.insert(start_node) {
            self.queue.push_back(start_node);
        }
    }

    /// Returns whether the given node has been visited.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::BreadthFirstTraversal};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// graph.add_edge(n1, n2, ());
    ///
    /// let mut traversal = BreadthFirstTraversal::with_start_node(&graph, n1);
    ///
    /// assert!(!traversal.visited(n2)); // Not yet visited
    /// traversal.next(); // Visit n1
    /// assert!(traversal.visited(n2)); // Now visited (inside of the queue)
    /// ```
    #[must_use]
    pub fn visited(&self, node: N) -> bool {
        self.visited.contains(node)
    }
}

impl<G: DirectedGraph<NodeId = N> + Successors + ?Sized, N> Iterator
    for BreadthFirstTraversal<'_, G, N>
where
    N: Id,
{
    type Item = N;

    fn next(&mut self) -> Option<Self::Item> {
        let next = self.queue.pop_front()?;

        self.queue.extend(
            self.graph
                .successors(next)
                .filter(|&id| self.visited.insert(id)),
        );

        Some(next)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.graph.node_count() - self.visited.count();

        // Lower bound: at least the nodes currently in the queue
        // Upper bound: could visit up to all remaining unvisited nodes
        // Note: Due to disconnected components, we may not visit all nodes
        (self.queue.len(), Some(remaining))
    }
}
