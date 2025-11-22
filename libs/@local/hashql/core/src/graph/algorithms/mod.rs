pub mod tarjan;

use alloc::collections::VecDeque;

use super::{DirectedGraph, Successors};
use crate::id::{Id, bit_vec::MixedBitSet};

pub struct DepthFirstTraversal<'graph, G: ?Sized, N> {
    graph: &'graph G,
    stack: Vec<N>,
    visited: MixedBitSet<N>,
}

impl<'graph, G: ?Sized, N> DepthFirstTraversal<'graph, G, N>
where
    N: Id,
{
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

    pub fn with_start_node(graph: &'graph G, start_node: N) -> Self
    where
        G: DirectedGraph<NodeId = N>,
    {
        let mut traversal = DepthFirstTraversal::new(graph);
        traversal.stack.push(start_node);
        traversal
    }

    pub fn push_start_node(&mut self, start_node: N)
    where
        G: DirectedGraph<NodeId = N>,
    {
        if self.visited.insert(start_node) {
            self.stack.push(start_node);
        }
    }

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

        None
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.graph.node_count() - self.visited.count();

        // The size hint isn't fully accurate here, we know that we will at least visit all nodes in
        // the stack, but due to a disconnected graph, depending on the starting node we may not
        // visit all nodes.
        (self.stack.len(), Some(remaining))
    }
}

pub struct BreadthFirstTraversal<'graph, G: ?Sized, N> {
    graph: &'graph G,
    queue: VecDeque<N>,
    visited: MixedBitSet<N>,
}

impl<'graph, G: ?Sized, N> BreadthFirstTraversal<'graph, G, N>
where
    N: Id,
{
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

    pub fn with_start_node(graph: &'graph G, start_node: N) -> Self
    where
        G: DirectedGraph<NodeId = N>,
    {
        let mut traversal = BreadthFirstTraversal::new(graph);
        traversal.queue.push_back(start_node);
        traversal
    }

    pub fn push_start_node(&mut self, start_node: N)
    where
        G: DirectedGraph<NodeId = N>,
    {
        if self.visited.insert(start_node) {
            self.queue.push_back(start_node);
        }
    }

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

        None
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.graph.node_count() - self.visited.count();

        // The size hint isn't fully accurate here, we know that we will at least visit all nodes in
        // the queue, but due to a disconnected graph, depending on the starting node we may not
        // visit all nodes.
        (self.queue.len(), Some(remaining))
    }
}
