use ena::unify::UnifyKey as _;
use roaring::RoaringBitmap;

use super::Unification;
use crate::r#type::inference::variable::VariableId;

/// A graph representation of the type variables and their relationships.
///
/// The graph stores roots and edges separately for better cache locality.
pub(crate) struct Graph {
    roots: Vec<VariableId>,
    edges: Vec<RoaringBitmap>,

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
        let mut roots = Vec::with_capacity(length);
        let mut edges = Vec::with_capacity(length);
        let mut lookup = Vec::with_capacity(length);
        lookup.resize(length, Self::SENTINEL);

        // Create a condensed graph of all unified nodes
        #[expect(clippy::cast_possible_truncation)]
        for (variable_index, _) in unification.variables.iter().enumerate() {
            let id = VariableId::from_index(variable_index as u32);
            let root = unification.table.find(id);

            if lookup[root.into_usize()] == Self::SENTINEL {
                lookup[root.into_usize()] = index;

                roots.push(root);
                edges.push(RoaringBitmap::new());

                index += 1;
            }

            lookup[id.into_usize()] = lookup[root.into_usize()];
        }

        Self {
            roots,
            edges,
            lookup,
        }
    }

    pub(crate) fn outgoing_edges_of(&self, node: VariableId) -> impl Iterator<Item = usize> {
        let index = self.lookup[node.into_usize()];
        debug_assert_ne!(index, Self::SENTINEL);

        self.outgoing_edges(index)
    }

    pub(crate) fn outgoing_edges(&self, node: usize) -> impl Iterator<Item = usize> {
        self.edges[node].iter().map(|edge| edge as usize)
    }
}
