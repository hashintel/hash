use alloc::alloc::Global;
use core::alloc::Allocator;

use super::{
    DIRECTIONS, DirectedGraph, Direction, EdgeId, NodeId, Predecessors, Successors, Traverse,
};
use crate::id::{HasId, IdSlice, IdVec};

const TOMBSTONE: EdgeId = EdgeId(usize::MAX);

pub struct Node<N> {
    id: NodeId,

    pub data: N,

    edges: [EdgeId; DIRECTIONS],
}

impl<N> HasId for Node<N> {
    type Id = NodeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

pub struct Edge<E> {
    id: EdgeId,

    source: NodeId,
    target: NodeId,

    pub data: E,

    next: [EdgeId; DIRECTIONS],
}

impl<E> HasId for Edge<E> {
    type Id = EdgeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

impl<E> Edge<E> {
    pub const fn source(&self) -> NodeId {
        self.source
    }

    pub const fn target(&self) -> NodeId {
        self.target
    }

    pub const fn opposite(&self, direction: Direction) -> NodeId {
        // The as cast allows this to be `const`
        if (direction as usize) == (Direction::Outgoing as usize) {
            self.target
        } else {
            self.source
        }
    }
}

pub struct LinkedGraph<N, E, A: Allocator = Global> {
    nodes: IdVec<NodeId, Node<N>, A>,
    edges: IdVec<EdgeId, Edge<E>, A>,
}

impl<N, E, A: Allocator> LinkedGraph<N, E, A> {
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            nodes: IdVec::new_in(alloc.clone()),
            edges: IdVec::new_in(alloc),
        }
    }

    pub fn add_node(&mut self, data: N) -> NodeId {
        self.nodes.push_with(|id| Node {
            id,
            data,
            edges: [TOMBSTONE; DIRECTIONS],
        })
    }

    pub fn node(&self, id: NodeId) -> Option<&Node<N>> {
        self.nodes.get(id)
    }

    pub fn nodes(&self) -> &IdSlice<NodeId, Node<N>> {
        self.nodes.as_slice()
    }

    pub fn add_edge(&mut self, source: NodeId, target: NodeId, data: E) -> EdgeId {
        let source_outgoing = self.nodes[source].edges[Direction::Outgoing as usize];
        let target_incoming = self.nodes[target].edges[Direction::Incoming as usize];

        let edge_id = self.edges.push_with(|id| Edge {
            id,
            source,
            target,
            data,
            next: [source_outgoing, target_incoming],
        });

        self.nodes[source].edges[Direction::Outgoing as usize] = edge_id;
        self.nodes[target].edges[Direction::Incoming as usize] = edge_id;

        edge_id
    }

    pub fn edge(&self, id: EdgeId) -> Option<&Edge<E>> {
        self.edges.get(id)
    }

    pub fn edges(&self) -> &IdSlice<EdgeId, Edge<E>> {
        self.edges.as_slice()
    }

    #[must_use]
    pub fn incident_edges(&self, node: NodeId, direction: Direction) -> IncidentEdges<'_, N, E, A> {
        IncidentEdges::new(self, direction, node)
    }

    #[must_use]
    pub fn incoming_edges(&self, node: NodeId) -> IncidentEdges<'_, N, E, A> {
        IncidentEdges::new(self, Direction::Incoming, node)
    }

    #[must_use]
    pub fn outgoing_edges(&self, node: NodeId) -> IncidentEdges<'_, N, E, A> {
        IncidentEdges::new(self, Direction::Outgoing, node)
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

pub struct IncidentEdges<'graph, N, E, A: Allocator = Global> {
    graph: &'graph LinkedGraph<N, E, A>,
    direction: Direction,
    next: EdgeId,
}

impl<'graph, N, E, A: Allocator> IncidentEdges<'graph, N, E, A> {
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
        if self.next == TOMBSTONE {
            return None;
        }

        let id = self.next;
        let edge = &self.graph.edges[id];
        self.next = edge.next[self.direction as usize];

        Some(edge)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (0, Some(self.graph.nodes.len()))
    }
}
