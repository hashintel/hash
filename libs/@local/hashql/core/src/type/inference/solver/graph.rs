use core::{mem, mem::size_of};

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

        let nodes = Vec::with_capacity(length);
        let lookup = Vec::with_capacity(length);

        let mut this = Self { nodes, lookup };
        this.expansion(unification);

        this
    }

    pub(crate) fn expansion(&mut self, unification: &mut Unification) {
        let length = unification.variables.len();

        // There can never be more than `u32` variables (due to ena), if we're on a 64 bit system we
        // do not have to worry about overflow for the max sentinel value. In case of 32 bit
        // systems, if the length is exactly `u32::MAX`, we need to error out.
        assert!(
            size_of::<usize>() != size_of::<u32>() || length < u32::MAX as usize,
            "Too many variables, cannot use `usize::MAX` as sentinel value"
        );

        let offset = self.lookup.len();

        // Takes an existing graph, and adds any nodes that haven't been added yet.
        self.lookup.resize(length, Self::SENTINEL);

        let mut index = self.nodes.len();

        #[expect(clippy::cast_possible_truncation, reason = "assert verifies invariant")]
        for variable_index in offset..unification.variables.len() {
            let id = VariableId::from_index(variable_index as u32);
            let root = unification.table.find(id);

            if self.lookup[root.into_usize()] == Self::SENTINEL {
                self.lookup[root.into_usize()] = index;

                self.nodes.push(Node {
                    id: root,
                    edges: RoaringBitmap::new(),
                });

                index += 1;
            }

            self.lookup[id.into_usize()] = self.lookup[root.into_usize()];
        }
    }

    /// Condenses the graph by merging nodes that belong to the same equivalence class.
    ///
    /// This operation restructures the graph to reflect the current state of unification:
    /// 1. Identifies and preserves root nodes (representatives of equivalence classes)
    /// 2. Reorders nodes so that all root nodes appear at the beginning
    /// 3. Merges edges from non-root nodes into their representatives
    /// 4. Rewrites edges to point to representatives instead of original nodes
    /// 5. Truncates the graph to remove non-root nodes
    /// 6. Updates the lookup table to reflect the new structure
    ///
    /// This optimizes the graph representation by reducing the number of nodes while
    /// preserving the essential relationships between equivalence classes.
    ///
    /// # Algorithm Complexity
    ///
    /// - Time: O(E + V), where E is the number of edges and V is the number of nodes
    /// - Space: O(V) for temporary data structures
    pub(crate) fn condense(&mut self, unification: &mut Unification) {
        // Maps from old node index to new node index
        let mut new_to_old: Vec<_> = (0..self.nodes.len()).collect();
        let mut old_to_new = new_to_old.clone();

        // Reorder the nodes so that the roots are at the beginning of the list
        // it's important that this step happens at the beginning, before representatives are
        // populated, as otherwise we might map to the wrong root
        let mut current = 0;
        for index in 0..self.nodes.len() {
            let node_id = self.nodes[index].id;
            let root_id = unification.table.find(node_id);

            if node_id != root_id {
                continue;
            }

            self.nodes.swap(current, index);

            new_to_old.swap(current, index);

            let old_left = new_to_old[current];
            let old_right = new_to_old[index];

            old_to_new[old_left] = current;
            old_to_new[old_right] = index;

            // Re-use `self.lookup`, note that this means that `self.lookup` is now in a partially
            // invalid state, which will be fixed at the end.
            self.lookup[root_id.into_usize()] = current;

            current += 1;
        }

        // Figure out which node-index each old index flows to
        // This maps each node to its representative in the condensed graph
        let mut representatives = vec![Self::SENTINEL; self.nodes.len()];

        for (index, node) in self.nodes.iter().enumerate() {
            let root = unification.table.find(node.id);
            let root_index = self.lookup[root.into_usize()];
            debug_assert_ne!(root_index, Self::SENTINEL);

            representatives[index] = root_index;
        }

        // Merge subordinate edges up into their representative
        // Only consider non-root nodes (nodes which are after current)
        for (index, repr) in representatives[current..].iter().copied().enumerate() {
            let index = index + current; // The index is offset from `current`

            let [repr, node] = self
                .nodes
                .get_disjoint_mut([repr, index])
                .unwrap_or_else(|_err| unreachable!());

            // Union the edges of the node into its representative
            let edges = mem::take(&mut node.edges);
            repr.edges |= edges;
        }

        // Rewrite the surviving bitmaps in place
        // This remaps edges to point to representatives instead of original nodes
        // We use a buffer to avoid allocating a new bitmap for each node
        let mut buffer = RoaringBitmap::new();

        for (index, node) in self.nodes[..current].iter_mut().enumerate() {
            // Build a new bitmap with remapped edge targets
            for target in &node.edges {
                let redirected = old_to_new[target as usize];
                let target_repr = representatives[redirected];

                if target_repr == index {
                    // Self-loops are removed
                    continue;
                }

                #[expect(clippy::cast_possible_truncation)]
                buffer.insert(target_repr as u32);
            }

            mem::swap(&mut node.edges, &mut buffer);
            buffer.clear();
        }

        // Compact the representation, because we know that the roots are at the front this is
        // simply a truncation
        self.nodes.truncate(current);

        // Regenerate the lookup table to map variable IDs to their new indices
        #[expect(clippy::cast_possible_truncation)]
        for index in 0..self.lookup.len() {
            let id = VariableId::from_index(index as u32);
            let root = unification.table.find(id);

            if id == root {
                continue;
            }

            // We've already adjusted the lookup for the root node
            self.lookup[index] = self.lookup[root.into_usize()];
            debug_assert_ne!(self.lookup[index], Self::SENTINEL);
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

    #[cfg(test)]
    #[expect(clippy::cast_possible_truncation)]
    pub(crate) fn edge_count(&self) -> usize {
        self.nodes
            .iter()
            .map(|node| node.edges.len() as usize)
            .sum()
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

#[cfg(test)]
mod tests {
    use core::borrow::Borrow;

    use super::Graph;
    use crate::r#type::{
        inference::{VariableKind, solver::Unification, variable::VariableId},
        kind::infer::HoleId,
    };

    #[expect(clippy::cast_sign_loss)]
    fn insert_edges(
        graph: &mut Graph,
        variables: &[VariableId],
        edges: impl IntoIterator<Item: IntoIterator<Item: Borrow<i32>>>,
    ) {
        let edges = edges.into_iter();

        for (source, targets) in edges.enumerate() {
            for target in targets {
                assert!(*target.borrow() >= 0);
                graph.insert_edge(variables[source], variables[*target.borrow() as usize]);
            }
        }
    }

    #[expect(clippy::cast_possible_truncation)]
    fn build_graph(
        unification: &mut Unification,
        edges: impl IntoIterator<Item: IntoIterator<Item: Borrow<i32>>, IntoIter: ExactSizeIterator>,
    ) -> (Graph, Vec<VariableId>) {
        let edges = edges.into_iter();

        let mut variables = Vec::with_capacity(edges.len());
        for index in 0..edges.len() {
            let id = unification.upsert_variable(VariableKind::Hole(HoleId::new(index as u32)));

            variables.push(id);
        }

        let mut graph = Graph::new(unification);

        insert_edges(&mut graph, &variables, edges);

        (graph, variables)
    }

    #[expect(clippy::cast_possible_truncation)]
    fn unify(unification: &mut Unification, left: usize, right: usize) {
        unification.unify(
            VariableKind::Hole(HoleId::new(left as u32)),
            VariableKind::Hole(HoleId::new(right as u32)),
        );
    }

    // The expected has the format `(sources - unified, targets)
    #[track_caller]
    #[expect(clippy::cast_sign_loss)]
    fn assert_condensed(graph: &Graph, variables: &[VariableId], expected: &[(&[i32], &[i32])]) {
        let expected_edges: usize = expected.iter().map(|(_, targets)| targets.len()).sum();

        assert_eq!(
            graph.node_count(),
            expected.len(),
            "Expected node count to match"
        );
        assert_eq!(
            graph.edge_count(),
            expected_edges,
            "Expected edge count to match"
        );

        for &(node, targets) in expected {
            // Check that each node in the condensed group now maps to the same variable
            let [first, rest @ ..] = node else {
                panic!("Expected at least one element")
            };

            let first = graph.lookup_id(variables[*first as usize]);
            for &item in rest {
                assert_eq!(
                    graph.lookup_id(variables[item as usize]),
                    first,
                    "Expected all nodes to map to the same variable"
                );
            }

            // Check if the target exists in the outgoing edges of the first node
            for target in targets {
                let target_id = graph.lookup_id(variables[*target as usize]);
                assert!(
                    graph
                        .outgoing_edges_by_index(first)
                        .any(|target| target == target_id),
                    "Expected target to exist in outgoing edges"
                );
            }
        }
    }

    #[test]
    fn empty_graph_condense() {
        let mut unification = Unification::new();
        let mut graph = Graph::new(&mut unification);

        // Condense an empty graph - should not panic
        graph.condense(&mut unification);

        assert_eq!(graph.node_count(), 0);
        assert_eq!(graph.edge_count(), 0);
    }

    #[test]
    fn single_node_condense() {
        let mut unification = Unification::new();
        let (mut graph, variables) = build_graph(&mut unification, [&[] as &[_]]);

        // Condense the graph - nothing should change
        graph.condense(&mut unification);

        assert_eq!(graph.node_count(), 1);
        assert_eq!(graph.edge_count(), 0);
        assert_eq!(graph.lookup_id(variables[0]), 0);
    }

    #[test]
    fn no_unification_condense() {
        let mut unification = Unification::new();

        // Create a simple graph A→B→C with no unifications
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[1] as &[_], // A → B
                &[2],         // B → C
                &[],          // C has no outgoing edges
            ],
        );

        assert_eq!(graph.node_count(), 3);
        assert_eq!(graph.edge_count(), 2);

        // Condense - should not change the graph since no unification happened
        graph.condense(&mut unification);

        // After condensing - should be the same
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0], &[1]), // A → B
                (&[1], &[2]), // B → C
                (&[2], &[]),  // C has no outgoing edges
            ],
        );
    }

    #[test]
    fn two_node_unification() {
        let mut unification = Unification::new();

        // Create a graph with A→C, B→C and then unify A+B
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[2] as &[_], // A → C
                &[2],         // B → C
                &[],          // C has no outgoing edges
            ],
        );

        // Unify A and B
        unify(&mut unification, 0, 1);

        // Before condensing
        assert_eq!(graph.node_count(), 3);
        assert_eq!(graph.edge_count(), 2);

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Should have 2 nodes (AB, C)
        // - Should have 1 edge (AB→C)
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 1], &[2]), // AB → C
                (&[2], &[]),     // C has no outgoing edges
            ],
        );
    }

    #[test]
    fn self_loop_elimination() {
        let mut unification = Unification::new();

        // Create a graph with A→B, B→A and then unify A+B
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[1] as &[_], // A → B
                &[0],         // B → A
            ],
        );

        // Before unification
        assert_eq!(graph.node_count(), 2);
        assert_eq!(graph.edge_count(), 2);

        // Unify A and B
        unify(&mut unification, 0, 1);

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Should have 1 node (AB)
        // - Should have 0 edges (self-loops eliminated)
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 1], &[]), // AB with no outgoing edges (self-loop eliminated)
            ],
        );
    }

    #[test]
    fn multiple_equivalence_classes() {
        let mut unification = Unification::new();

        // Create a graph with nodes A,B,C,D,E,F and edges
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[2] as &[_], // A → C
                &[4],         // B → E
                &[],          // C has no outgoing edges
                &[5],         // D → F
                &[],          // E has no outgoing edges
                &[],          // F has no outgoing edges
            ],
        );

        // Add an extra edge from A to F
        graph.insert_edge(variables[0], variables[5]);

        // Create three equivalence classes: A+B, C+D, E+F
        unify(&mut unification, 0, 1); // A+B
        unify(&mut unification, 2, 3); // C+D
        unify(&mut unification, 4, 5); // E+F

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Should have 3 nodes (AB, CD, EF)
        // - Original edges A→C, B→E, D→F, A→F become AB→CD, AB→EF, CD→EF
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 1], &[2, 5]), // AB → CD, EF
                (&[2, 3], &[4]),    // CD → EF
                (&[4, 5], &[]),     // EF has no outgoing edges
            ],
        );
    }

    #[test]
    fn cyclic_graph_unification() {
        let mut unification = Unification::new();

        // Create a graph with cycle A→B→C→D→A
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[1] as &[_], // A → B
                &[2],         // B → C
                &[3],         // C → D
                &[0],         // D → A (closing the cycle)
            ],
        );

        // Unify alternate nodes: A+C, B+D
        unify(&mut unification, 0, 2); // A+C
        unify(&mut unification, 1, 3); // B+D

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Should have 2 nodes (AC, BD)
        // - Cycle should be preserved as AC→BD→AC
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 2], &[1]), // AC → BD
                (&[1, 3], &[0]), // BD → AC
            ],
        );
    }

    #[test]
    fn complete_unification() {
        let mut unification = Unification::new();

        // Create a graph where all nodes are connected to each other
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[1, 2, 3, 4] as &[_], // A → B,C,D,E
                &[0, 2, 3, 4],         // B → A,C,D,E
                &[0, 1, 3, 4],         // C → A,B,D,E
                &[0, 1, 2, 4],         // D → A,B,C,E
                &[0, 1, 2, 3],         // E → A,B,C,D
            ],
        );

        // Unify all nodes into a single equivalence class
        for i in 1..variables.len() {
            unify(&mut unification, 0, i);
        }

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Should have 1 node
        // - Should have 0 edges (all self-loops eliminated)
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 1, 2, 3, 4], &[]), // All nodes unified with no outgoing edges
            ],
        );
    }

    #[test]
    fn incremental_condensation() {
        let mut unification = Unification::new();

        // Create a graph with 6 nodes in a star pattern from A
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[1, 2, 3, 4, 5] as &[_], // A → B,C,D,E,F
                &[],                      // B has no outgoing edges
                &[],                      // C has no outgoing edges
                &[],                      // D has no outgoing edges
                &[],                      // E has no outgoing edges
                &[],                      // F has no outgoing edges
            ],
        );

        // First step: unify B+C+D
        unify(&mut unification, 1, 2);
        unify(&mut unification, 2, 3);

        // First condensation
        graph.condense(&mut unification);

        // After first condensation: A, BCD, E, F
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0], &[1, 4, 5]), // A → BCD, E, F
                (&[1, 2, 3], &[]),  // BCD has no outgoing edges
                (&[4], &[]),        // E has no outgoing edges
                (&[5], &[]),        // F has no outgoing edges
            ],
        );

        // Second step: unify E+F
        unify(&mut unification, 4, 5);

        // Second condensation
        graph.condense(&mut unification);

        // After second condensation: A, BCD, EF
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0], &[1, 4]),   // A → BCD, EF
                (&[1, 2, 3], &[]), // BCD has no outgoing edges
                (&[4, 5], &[]),    // EF has no outgoing edges
            ],
        );

        // Final step: unify A with BCD
        unify(&mut unification, 0, 1);

        // Final condensation
        graph.condense(&mut unification);

        // After final condensation: ABCD, EF
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 1, 2, 3], &[4]), // ABCD → EF
                (&[4, 5], &[]),        // EF has no outgoing edges
            ],
        );
    }

    #[test]
    fn complex_edge_merging() {
        let mut unification = Unification::new();

        // Create a graph where multiple nodes in same class have edges to different targets
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[2, 3] as &[_], // A → C,D
                &[3, 4],         // B → D,E
                &[],             // C has no outgoing edges
                &[],             // D has no outgoing edges
                &[],             // E has no outgoing edges
            ],
        );

        // Unify A+B
        unify(&mut unification, 0, 1);

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Should have 4 nodes (AB, C, D, E)
        // - AB should have edges to C, D, and E
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 1], &[2, 3, 4]), // AB → C,D,E
                (&[2], &[]),           // C has no outgoing edges
                (&[3], &[]),           // D has no outgoing edges
                (&[4], &[]),           // E has no outgoing edges
            ],
        );
    }

    #[test]
    fn disconnected_components() {
        let mut unification = Unification::new();

        // Create a graph with two disconnected components
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[1] as &[_], // A → B (component 1)
                &[],          // B has no outgoing edges
                &[3],         // C → D (component 2)
                &[],          // D has no outgoing edges
                &[5],         // E → F (component 3)
                &[],          // F has no outgoing edges
                &[7],         // G → H (component 4)
                &[],          // H has no outgoing edges
            ],
        );

        // Unify nodes across components: A+C, E+G, B+D+F+H
        unify(&mut unification, 0, 2); // A+C
        unify(&mut unification, 4, 6); // E+G

        // Unify all right-side nodes
        unify(&mut unification, 1, 3); // B+D
        unify(&mut unification, 3, 5); // D+F
        unify(&mut unification, 5, 7); // F+H

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Should have 3 nodes (AC, EG, BDFH)
        // - AC→BDFH, EG→BDFH
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 2], &[1]),      // AC → BDFH
                (&[4, 6], &[1]),      // EG → BDFH
                (&[1, 3, 5, 7], &[]), // BDFH has no outgoing edges
            ],
        );
    }

    #[test]
    fn node_order_preservation() {
        let mut unification = Unification::new();

        // Create a graph with multiple nodes
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[1, 2] as &[_], // A → B,C
                &[3, 4],         // B → D,E
                &[5],            // C → F
                &[],             // D has no outgoing edges
                &[],             // E has no outgoing edges
                &[],             // F has no outgoing edges
            ],
        );

        // Unify nodes such that the representatives are not the first nodes in their class
        // A+C, B+E
        unify(&mut unification, 0, 2);
        unify(&mut unification, 1, 4);

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Original edges A→B, A→C, B→D, B→E, C→F should become:
        // - AC→BE, AC→D, AC→F, BE→D
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 2], &[1, 5]), // AC → BE, F
                (&[1, 4], &[3]),    // BE → D
                (&[3], &[]),        // D has no outgoing edges
                (&[5], &[]),        // F has no outgoing edges
            ],
        );
    }

    #[test]
    fn edge_redirection() {
        let mut unification = Unification::new();

        // Create a graph with A→B→C→D→E→A (cyclic)
        let (mut graph, variables) = build_graph(
            &mut unification,
            [
                &[1] as &[_], // A → B
                &[2],         // B → C
                &[3],         // C → D
                &[4],         // D → E
                &[0],         // E → A (closing the cycle)
            ],
        );

        // Unify non-adjacent nodes: A+C+E, B+D
        unify(&mut unification, 0, 2);
        unify(&mut unification, 0, 4);
        unify(&mut unification, 1, 3);

        // Condense the graph
        graph.condense(&mut unification);

        // After condensing:
        // - Should have 2 nodes (ACE, BD)
        // - The cycle should become ACE→BD→ACE
        assert_condensed(
            &graph,
            &variables,
            &[
                (&[0, 2, 4], &[1]), // ACE → BD
                (&[1, 3], &[0]),    // BD → ACE
            ],
        );
    }
}
