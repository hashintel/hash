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
        traversal.push_start_node(start_node);
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
        traversal.push_start_node(start_node);
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

/// Frame for post-order DFS traversal tracking.
///
/// Each frame represents a node being explored, along with its successor iterator.
/// The iterator tracks which successors have been processed.
struct PostOrderFrame<N, I> {
    /// The node this frame represents.
    node: N,
    /// Iterator over this node's successors.
    successors: I,
}

/// Iterator for post-order depth-first traversal of a directed graph.
///
/// Post-order traversal visits all descendants of a node before visiting the node itself.
/// This is also known as "bottom-up" traversal - leaves are visited before their parents.
///
/// This traversal order is useful for:
/// - Dependency resolution (process dependencies before dependents)
/// - Computing properties that depend on descendants (e.g., subtree sizes)
/// - Topological sorting of DAGs
/// - Safe deletion of tree structures
///
/// # Examples
///
/// ```rust
/// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversalPostOrder};
/// #
/// let mut graph = LinkedGraph::new();
/// let root = graph.add_node("root");
/// let child1 = graph.add_node("child1");
/// let child2 = graph.add_node("child2");
/// let child3 = graph.add_node("child3");
/// graph.add_edge(root, child1, ());
/// graph.add_edge(root, child2, ());
/// graph.add_edge(child1, child3, ());
///
/// let traversal = DepthFirstTraversalPostOrder::with_start_node(&graph, root);
/// let visited: Vec<_> = traversal.collect();
/// # // Children are visited before the root
/// # assert_eq!(visited, [child2, child3, child1, root]);
/// ```
pub struct DepthFirstTraversalPostOrder<'graph, G: ?Sized, N, I> {
    graph: &'graph G,
    stack: Vec<PostOrderFrame<N, I>>,
    visited: MixedBitSet<N>,
}

impl<'graph, G: ?Sized, N, I> DepthFirstTraversalPostOrder<'graph, G, N, I>
where
    N: Id,
{
    /// Creates a new post-order depth-first traversal with no starting nodes.
    ///
    /// Use [`push_start_node`] to add starting nodes before iteration.
    ///
    /// [`push_start_node`]: DepthFirstTraversalPostOrder::push_start_node
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversalPostOrder};
    /// #
    /// let graph = LinkedGraph::<&str, ()>::new();
    /// let traversal = DepthFirstTraversalPostOrder::new(&graph);
    ///
    /// let visited: Vec<_> = traversal.collect();
    /// # assert_eq!(visited, []);
    /// ```
    pub fn new(graph: &'graph G) -> Self
    where
        G: DirectedGraph<NodeId = N> + Successors<SuccIter<'graph> = I>,
    {
        DepthFirstTraversalPostOrder {
            graph,
            stack: Vec::new(),
            visited: MixedBitSet::new_empty(graph.node_count()),
        }
    }

    /// Creates a new post-order depth-first traversal starting from the given node.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversalPostOrder};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// graph.add_edge(n1, n2, ());
    ///
    /// let traversal = DepthFirstTraversalPostOrder::with_start_node(&graph, n1);
    /// let visited: Vec<_> = traversal.collect();
    /// // n2 is visited before n1 (post-order)
    /// # assert_eq!(visited, [n2, n1]);
    /// ```
    pub fn with_start_node(graph: &'graph G, start_node: N) -> Self
    where
        G: DirectedGraph<NodeId = N> + Successors<SuccIter<'graph> = I>,
    {
        let mut traversal = DepthFirstTraversalPostOrder::new(graph);
        traversal.push_start_node(start_node);
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
    /// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversalPostOrder};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// let n3 = graph.add_node("C");
    /// graph.add_edge(n1, n2, ());
    /// // n3 is disconnected
    ///
    /// let mut traversal = DepthFirstTraversalPostOrder::new(&graph);
    /// traversal.push_start_node(n1);
    /// traversal.push_start_node(n3);
    ///
    /// let visited: Vec<_> = traversal.collect();
    /// // Post-order: descendants before ancestors
    /// # assert_eq!(visited, [n3, n2, n1]);
    /// ```
    pub fn push_start_node(&mut self, start_node: N)
    where
        G: DirectedGraph<NodeId = N> + Successors<SuccIter<'graph> = I>,
    {
        if self.visited.insert(start_node) {
            self.stack.push(PostOrderFrame {
                node: start_node,
                successors: self.graph.successors(start_node),
            });
        }
    }

    /// Returns whether the given node has been visited.
    ///
    /// A node is marked as visited when it's pushed onto the stack, not when
    /// it's yielded.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::graph::{LinkedGraph, algorithms::DepthFirstTraversalPostOrder};
    /// #
    /// let mut graph = LinkedGraph::new();
    /// let n1 = graph.add_node("A");
    /// let n2 = graph.add_node("B");
    /// graph.add_edge(n1, n2, ());
    ///
    /// let mut traversal = DepthFirstTraversalPostOrder::with_start_node(&graph, n1);
    ///
    /// assert!(traversal.visited(n1)); // Marked when pushed
    /// traversal.next(); // Visit n2 (post-order)
    /// assert!(traversal.visited(n2)); // Successor also marked
    ///
    /// # assert_eq!(traversal.next(), Some(n1));
    /// ```
    #[must_use]
    pub fn visited(&self, node: N) -> bool {
        self.visited.contains(node)
    }
}

impl<'graph, G: DirectedGraph<NodeId = N> + Successors<SuccIter<'graph> = I> + ?Sized, N, I>
    Iterator for DepthFirstTraversalPostOrder<'graph, G, N, I>
where
    N: Id,
    I: Iterator<Item = N>,
{
    type Item = N;

    fn next(&mut self) -> Option<Self::Item> {
        let node = 'recurse: loop {
            let PostOrderFrame { node, successors } = self.stack.last_mut()?;
            let node = *node;

            // Process successors until we find an unvisited one
            for successor in successors {
                if !self.visited.insert(successor) {
                    // Already visited, skip
                    continue;
                }

                // Found unvisited successor - push it and "recurse" by continuing outer loop
                self.stack.push(PostOrderFrame {
                    node: successor,
                    successors: self.graph.successors(successor),
                });

                continue 'recurse;
            }

            // All successors processed - we can now yield this node
            self.stack.pop();
            break node;
        };

        Some(node)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.graph.node_count() - self.visited.count();

        // Lower bound: at least the nodes currently in the stack
        // Upper bound: could visit up to all remaining unvisited nodes
        // Note: Due to disconnected components, we may not visit all nodes
        (self.stack.len(), Some(remaining))
    }
}
