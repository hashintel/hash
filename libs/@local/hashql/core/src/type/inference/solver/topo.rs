use bitvec::{bitbox, boxed::BitBox, field::BitField as _, slice::BitSlice};
use roaring::RoaringBitmap;

use super::graph::Graph;

struct VisitStateBuffer(BitBox);

impl VisitStateBuffer {
    fn new(length: usize) -> Self {
        Self(bitbox![0; length * 2])
    }

    fn get(&self, index: usize) -> VisitState {
        let offset = index * 2;
        let slice = &self.0[offset..offset + 2];

        VisitState::from_slice(slice)
    }

    fn set(&mut self, index: usize, state: VisitState) {
        let offset = index * 2;
        let slice = &mut self.0[offset..offset + 2];

        slice.store(state as u8);
    }
}

/// A node's visit state during topological sort
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum VisitState {
    /// Node has not been visited yet
    Unvisited,
    /// Node is currently being visited (in current DFS path)
    Visiting,
    /// Node has been completely visited
    Visited,
}

impl VisitState {
    fn from_slice(slice: &BitSlice) -> Self {
        let bytes = slice.load::<u8>();

        match bytes {
            0 => Self::Unvisited,
            1 => Self::Visiting,
            2 => Self::Visited,
            _ => panic!("Invalid visit state"),
        }
    }
}

/// Performs a topological sort on the graph.
///
/// If the graph is acyclic, returns a vector of nodes in topological order
/// (where dependencies come before dependents).
///
/// If the graph contains cycles, returns the nodes involved in a cycle.
pub(crate) fn topological_sort(graph: &Graph) -> Result<Vec<usize>, RoaringBitmap> {
    let node_count = graph.node_count();

    // Early return for empty graphs
    if node_count == 0 {
        return Ok(Vec::new());
    }

    // Track visit state for each node
    let mut states = VisitStateBuffer::new(node_count);
    // Result vector in reverse order (to avoid O(n) prepends)
    let mut sorted = Vec::with_capacity(node_count);
    // Track the current path for cycle detection
    let mut path = Vec::new();

    // Process each node
    for start in 0..node_count {
        let state = states.get(start);
        if state != VisitState::Unvisited {
            continue;
        }

        // Try to visit this node, return if we detect a cycle
        visit_node(graph, start, &mut states, &mut sorted, &mut path)?;
    }

    // Reverse to get correct topological order (dependencies before dependents)
    sorted.reverse();

    Ok(sorted)
}

/// Helper function for depth-first search during topological sort
fn visit_node(
    graph: &Graph,
    node: usize,
    states: &mut VisitStateBuffer,
    sorted: &mut Vec<usize>,
    path: &mut Vec<usize>,
) -> Result<(), RoaringBitmap> {
    // Mark as being visited
    states.set(node, VisitState::Visiting);
    path.push(node);

    // Visit all dependencies
    for neighbour in graph.outgoing_edges_by_index(node) {
        let state = states.get(neighbour);
        match state {
            VisitState::Unvisited => {
                // Recursively visit unvisited neighbors
                visit_node(graph, neighbour, states, sorted, path)?;
            }
            VisitState::Visiting => {
                // Found a cycle, extract the nodes in the cycle
                let cycle_start = path
                    .iter()
                    .position(|&node| node == neighbour)
                    .expect("Node should be part of the path");

                let cycle_nodes = path[cycle_start..]
                    .iter()
                    .map(|&node| node as u32)
                    .collect();

                return Err(cycle_nodes);
            }
            VisitState::Visited => {
                // Node already processed, nothing to do
            }
        }
    }

    // Remove from current path
    path.pop();

    // Mark as fully visited and add to result
    states.set(node, VisitState::Visited);
    sorted.push(node);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::topological_sort;
    use crate::r#type::inference::solver::graph::Graph;

    #[test]
    fn test_empty_graph() {
        let graph = Graph::from_edges([] as [&[_]; 0]);

        let result = topological_sort(&graph).expect("empty graph should not have cycles");
        assert!(result.is_empty());
    }

    #[test]
    fn test_single_node() {
        let graph = Graph::from_edges([&[]]);

        let result = topological_sort(&graph).expect("single node graph should not have cycles");
        assert_eq!(result, [0]);
    }

    #[test]
    fn test_dag() {
        // 0 --> 1 --> 3
        // |     ^
        // v     |
        // 2 -----
        let graph = Graph::from_edges([
            &[1_u32, 2] as &[_], // Node 0 points to 1 and 2
            &[3],                // Node 1 points to 3
            &[1],                // Node 2 points to 1
            &[],                 // Node 3 points to nothing
        ]);

        let result = topological_sort(&graph).expect("DAG should not have cycles");
        assert_eq!(result, [0, 2, 1, 3]);
    }

    #[test]
    fn test_cycle() {
        // 0 --> 1 --> 2 -->
        // ^               |
        // |               v
        // 4 <-- 3 <-------
        let graph = Graph::from_edges([
            [1_u32], // Node 0 points to 1
            [2],     // Node 1 points to 2
            [3],     // Node 2 points to 3
            [4],     // Node 3 points to 4
            [0],     // Node 4 points to 0 (creates a cycle)
        ]);

        let result = topological_sort(&graph).expect_err("should have detected a cycle");
        assert_eq!(result.iter().collect::<Vec<_>>(), [0, 1, 2, 3, 4]);
    }
}
