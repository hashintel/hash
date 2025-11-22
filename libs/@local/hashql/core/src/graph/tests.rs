use super::{DirectedGraph, EdgeId, NodeId, Predecessors, Successors};
use crate::{collections::FastHashMap, id::Id as _};

pub(super) struct TestGraph {
    node_count: usize,
    edge_count: usize,

    successors: FastHashMap<NodeId, Vec<(EdgeId, NodeId)>>,
    predecessors: FastHashMap<NodeId, Vec<(EdgeId, NodeId)>>,
}

impl TestGraph {
    pub(super) fn new(edges: &[(usize, usize)]) -> Self {
        let mut graph = Self {
            node_count: 0,
            edge_count: 0,
            successors: FastHashMap::default(),
            predecessors: FastHashMap::default(),
        };

        for &(source, target) in edges {
            let source = NodeId::new(source);
            let target = NodeId::new(target);

            graph.node_count = graph
                .node_count
                .max(source.as_usize() + 1)
                .max(target.as_usize() + 1);

            let edge_id = EdgeId::new(graph.edge_count);

            graph
                .successors
                .entry(source)
                .or_default()
                .push((edge_id, target));

            graph
                .predecessors
                .entry(target)
                .or_default()
                .push((edge_id, source));

            graph.edge_count += 1;
        }

        for node in 0..graph.node_count {
            let node = NodeId::new(node);

            graph.successors.entry(node).or_default();
            graph.predecessors.entry(node).or_default();
        }

        graph
    }
}

impl DirectedGraph for TestGraph {
    type Edge<'this>
        = EdgeId
    where
        Self: 'this;
    type Node<'this>
        = NodeId
    where
        Self: 'this;

    fn edge_count(&self) -> usize {
        self.edge_count
    }

    fn node_count(&self) -> usize {
        self.node_count
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        (0..self.node_count).map(NodeId::new)
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        (0..self.edge_count).map(EdgeId::new)
    }
}

impl Predecessors for TestGraph {
    type PredIter<'this>
        = impl Iterator<Item = NodeId>
    where
        Self: 'this;

    fn predecessors(&self, node: NodeId) -> Self::PredIter<'_> {
        self.predecessors[&node].iter().map(|&(_, node)| node)
    }
}

impl Successors for TestGraph {
    type SuccIter<'this>
        = impl Iterator<Item = NodeId>
    where
        Self: 'this;

    fn successors(&self, node: NodeId) -> Self::SuccIter<'_> {
        self.successors[&node].iter().map(|&(_, node)| node)
    }
}
