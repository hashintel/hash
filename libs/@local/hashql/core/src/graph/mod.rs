use self::algorithms::{BreadthFirstTraversal, DepthFirstTraversal};
use crate::id::{HasId, newtype};

pub mod algorithms;
pub mod linked;
#[cfg(test)]
mod tests;

newtype!(pub struct NodeId(usize is 0..=usize::MAX));
newtype!(pub struct EdgeId(usize is 0..=usize::MAX));

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Direction {
    Outgoing = 0,
    Incoming = 1,
}

pub(crate) const DIRECTIONS: usize = core::mem::variant_count::<Direction>();

pub trait DirectedGraph {
    type Node<'this>: HasId<Id = NodeId>
    where
        Self: 'this;
    type Edge<'this>: HasId<Id = EdgeId>
    where
        Self: 'this;

    fn node_count(&self) -> usize;
    fn edge_count(&self) -> usize;

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator;
    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator;
}

pub trait Successors: DirectedGraph {
    type SuccIter<'this>: Iterator<Item = NodeId>
    where
        Self: 'this;

    fn successors(&self, node: NodeId) -> Self::SuccIter<'_>;
}

pub trait Predecessors: DirectedGraph {
    type PredIter<'this>: Iterator<Item = NodeId>
    where
        Self: 'this;

    fn predecessors(&self, node: NodeId) -> Self::PredIter<'_>;
}

pub trait Traverse: DirectedGraph + Successors {
    fn depth_first_traversal(
        &self,
        start: impl IntoIterator<Item = NodeId>,
    ) -> impl Iterator<Item = NodeId> {
        let mut traversal = DepthFirstTraversal::new(self);

        for start in start {
            traversal.push_start_node(start);
        }

        traversal
    }
    fn breadth_first_traversal(
        &self,
        node: impl IntoIterator<Item = NodeId>,
    ) -> impl Iterator<Item = NodeId> {
        let mut traversal = BreadthFirstTraversal::new(self);

        for start in node {
            traversal.push_start_node(start);
        }

        traversal
    }
}
