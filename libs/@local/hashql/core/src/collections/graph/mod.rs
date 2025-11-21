use crate::id::newtype;

pub mod linked;

newtype!(pub struct NodeId(usize is 0..=usize::MAX));
newtype!(pub struct EdgeId(usize is 0..=usize::MAX));

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Direction {
    Outgoing = 0,
    Incoming = 1,
}

pub(crate) const DIRECTIONS: usize = core::mem::variant_count::<Direction>();

pub trait DirectedGraph {
    type Node;
    type Edge;

    fn node_count(&self) -> usize;
    fn edge_count(&self) -> usize;

    fn iter_nodes(
        &self,
    ) -> impl ExactSizeIterator<Item = (NodeId, &Self::Node)> + DoubleEndedIterator;

    fn iter_edges(
        &self,
    ) -> impl ExactSizeIterator<Item = (EdgeId, &Self::Edge)> + DoubleEndedIterator;
}

pub trait Successors: DirectedGraph {
    fn successors(&self, node: NodeId) -> impl Iterator<Item = NodeId>;
}

pub trait Predecessors: DirectedGraph {
    fn predecessors(&self, node: NodeId) -> impl Iterator<Item = NodeId>;
}
