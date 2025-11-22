mod tarjan;

use alloc::collections::VecDeque;

use super::{DirectedGraph, NodeId, Successors};
use crate::id::bit_vec::MixedBitSet;

pub struct DepthFirstTraversal<'graph, G: ?Sized> {
    graph: &'graph G,
    stack: Vec<NodeId>,
    visited: MixedBitSet<NodeId>,
}

impl<'graph, G: ?Sized> DepthFirstTraversal<'graph, G> {
    pub fn new(graph: &'graph G) -> Self
    where
        G: DirectedGraph,
    {
        DepthFirstTraversal {
            graph,
            stack: Vec::new(),
            visited: MixedBitSet::new_empty(graph.node_count()),
        }
    }

    pub fn with_start_node(graph: &'graph G, start_node: NodeId) -> Self
    where
        G: DirectedGraph,
    {
        let mut traversal = DepthFirstTraversal::new(graph);
        traversal.stack.push(start_node);
        traversal
    }

    pub fn push_start_node(&mut self, start_node: NodeId)
    where
        G: DirectedGraph,
    {
        if self.visited.insert(start_node) {
            self.stack.push(start_node);
        }
    }

    pub fn visited(&self, node: NodeId) -> bool {
        self.visited.contains(node)
    }
}

impl<G: DirectedGraph + Successors + ?Sized> Iterator for DepthFirstTraversal<'_, G> {
    type Item = NodeId;

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

pub struct BreadthFirstTraversal<'graph, G: ?Sized> {
    graph: &'graph G,
    queue: VecDeque<NodeId>,
    visited: MixedBitSet<NodeId>,
}

impl<'graph, G: ?Sized> BreadthFirstTraversal<'graph, G> {
    pub fn new(graph: &'graph G) -> Self
    where
        G: DirectedGraph,
    {
        BreadthFirstTraversal {
            graph,
            queue: VecDeque::new(),
            visited: MixedBitSet::new_empty(graph.node_count()),
        }
    }

    pub fn with_start_node(graph: &'graph G, start_node: NodeId) -> Self
    where
        G: DirectedGraph,
    {
        let mut traversal = BreadthFirstTraversal::new(graph);
        traversal.queue.push_back(start_node);
        traversal
    }

    pub fn push_start_node(&mut self, start_node: NodeId)
    where
        G: DirectedGraph,
    {
        if self.visited.insert(start_node) {
            self.queue.push_back(start_node);
        }
    }

    #[must_use]
    pub fn visited(&self, node: NodeId) -> bool {
        self.visited.contains(node)
    }
}

impl<G: DirectedGraph + Successors + ?Sized> Iterator for BreadthFirstTraversal<'_, G> {
    type Item = NodeId;

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
