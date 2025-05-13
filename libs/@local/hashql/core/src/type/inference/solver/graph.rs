use ena::unify::UnifyKey as _;
use roaring::RoaringBitmap;

use super::Unification;
use crate::r#type::inference::variable::VariableId;

#[derive(Debug, Clone)]
struct Node {
    id: VariableId,
    edges: RoaringBitmap,
}

/// A graph representation of the type variables and their relationships.
///
/// Simple compact adjacency list representation of the graph.
#[derive(Debug, Clone)]
pub(crate) struct Graph {
    nodes: Vec<Node>,

    // Maps variable IDs to their index in the above vectors, the position corresponds to the index
    // of the variable.
    lookup: Vec<usize>,
}

impl Graph {
    const SENTINEL: usize = usize::MAX;

    pub(crate) fn new(unification: &mut Unification) -> Self {
        let length = unification.variables.len();

        // There can never be more than `u32` variables (due to ena), if we're on a 64 bit system we
        // do not have to worry about overflow for the max sentinel value. In case of 32 bit
        // systems, if the length is exactly `u32::MAX`, we need to error out.
        assert!(
            size_of::<usize>() != size_of::<u32>() || length < u32::MAX as usize,
            "Too many variables, cannot use `usize::MAX` as sentinel value"
        );

        let mut index = 0;
        let mut nodes = Vec::with_capacity(length);
        let mut lookup = Vec::with_capacity(length);
        lookup.resize(length, Self::SENTINEL);

        // Create a condensed graph of all unified nodes
        #[expect(clippy::cast_possible_truncation)]
        for (variable_index, _) in unification.variables.iter().enumerate() {
            let id = VariableId::from_index(variable_index as u32);
            let root = unification.table.find(id);

            if lookup[root.into_usize()] == Self::SENTINEL {
                lookup[root.into_usize()] = index;

                nodes.push(Node {
                    id: root,
                    edges: RoaringBitmap::new(),
                });

                index += 1;
            }

            lookup[id.into_usize()] = lookup[root.into_usize()];
        }

        Self { nodes, lookup }
    }

    #[cfg(test)]
    pub(crate) fn from_edges(
        nodes: impl IntoIterator<Item: AsRef<[u32]>, IntoIter: ExactSizeIterator>,
    ) -> Self {
        let iter = nodes.into_iter();
        let node_count = iter.len();

        let mut nodes = Vec::with_capacity(node_count);
        let mut lookup = Vec::with_capacity(node_count);

        #[expect(clippy::cast_possible_truncation)]
        for (index, node) in iter.enumerate() {
            let mut bitmap = RoaringBitmap::new();
            for &edge in node.as_ref() {
                bitmap.insert(edge);
            }

            nodes.push(Node {
                id: VariableId::from_index(index as u32),
                edges: bitmap,
            });
            lookup.push(index);
        }

        Self { nodes, lookup }
    }

    pub(crate) fn nodes(&self) -> impl Iterator<Item = VariableId> {
        self.nodes.iter().map(|node| node.id)
    }

    pub(crate) fn node(&self, index: usize) -> VariableId {
        self.nodes[index].id
    }

    pub(crate) const fn node_count(&self) -> usize {
        self.nodes.len()
    }

    #[inline]
    fn lookup_id(&self, id: VariableId) -> usize {
        let index = self.lookup[id.into_usize()];
        debug_assert_ne!(index, Self::SENTINEL);

        index
    }

    #[expect(clippy::cast_possible_truncation)]
    pub(crate) fn insert_edge(&mut self, source: VariableId, target: VariableId) {
        let source_index = self.lookup_id(source);
        let target_index = self.lookup_id(target);

        debug_assert_ne!(source_index, Self::SENTINEL);
        debug_assert_ne!(target_index, Self::SENTINEL);

        if source_index == target_index {
            // We do not support self-loops.
            return;
        }

        self.nodes[source_index].edges.insert(target_index as u32);
    }

    pub(crate) fn outgoing_edges_by_index(&self, node: usize) -> impl Iterator<Item = usize> {
        self.nodes[node].edges.iter().map(|edge| edge as usize)
    }
}
