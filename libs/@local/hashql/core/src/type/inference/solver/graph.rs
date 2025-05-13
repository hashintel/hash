use core::mem;

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

    pub(crate) fn condense(&mut self, unification: &mut Unification) {
        let mut root_lookup = vec![Self::SENTINEL; self.nodes.len()];
        let mut root_mapping = vec![Self::SENTINEL; self.nodes.len()];

        // Reorder the nodes so that the roots are at the beginning of the list
        // it's important that this step happens at the beginning, before representatives are
        // populated, as otherwise we might map to the wrong root
        let mut current = 0;
        #[expect(clippy::needless_range_loop)]
        for index in 0..self.nodes.len() {
            let node_id = self.nodes[index].id;
            let root_id = unification.table.find(node_id);

            if node_id != root_id {
                continue;
            }

            self.nodes.swap(current, index);
            root_lookup[root_id.into_usize()] = current;
            root_mapping[index] = current;

            current += 1;
        }

        // Figure out which node-index each old index flows to
        let mut representatives = vec![Self::SENTINEL; self.nodes.len()];
        for (index, node) in self.nodes.iter().enumerate() {
            let root = unification.table.find(node.id);
            let root_index = root_lookup[root.into_usize()];
            debug_assert_ne!(root_index, Self::SENTINEL);

            representatives[index] = root_index;
        }

        // Merge subordinate edges up into their representative
        #[expect(clippy::tuple_array_conversions, reason = "readability")]
        for (index, repr) in representatives.iter().copied().enumerate() {
            if index == repr {
                // This node is its own representative, so we don't need to do anything.
                continue;
            }

            let [repr, node] = self
                .nodes
                .get_disjoint_mut([repr, index])
                .unwrap_or_else(|_err| unreachable!());

            // Union the edges of the node into it's representative
            let edges = mem::take(&mut node.edges);
            repr.edges |= edges;
        }

        // Rewrite the surviving bitmaps in place
        let mut buffer = RoaringBitmap::new();
        for (index, (node, repr)) in self
            .nodes
            .iter_mut()
            .zip(representatives.iter().copied())
            .enumerate()
        {
            // These are later removed and do not need any rewrite
            if repr != index {
                continue;
            }

            for target in &node.edges {
                let target_repr = representatives[target as usize];

                if target_repr == index {
                    // self-loops are removed
                    continue;
                }

                buffer.insert(target_repr as u32);
            }

            mem::swap(&mut node.edges, &mut buffer);
            buffer.clear();
        }

        // Compact the representation, because we know that the roots are at the front this is
        // simply a truncation
        self.nodes.truncate(current);

        // Regenerate the lookup table
        for index in &mut self.lookup {
            *index = root_mapping[*index];
        }
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
