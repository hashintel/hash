use alloc::collections::VecDeque;
use core::alloc::Allocator;

use roaring::RoaringBitmap;

use super::graph::{EdgeKind, Graph};

/// Performs a topological sort on a directed graph using Kahn's algorithm in the specified
/// allocator.
///
/// # Algorithm
///
/// Kahn's algorithm works by repeatedly removing nodes that have no incoming edges
/// (no dependencies) and adding them to the result order. As nodes are removed, their
/// outgoing edges are also removed, potentially creating new nodes with no dependencies.
///
/// 1. Calculate the in-degree (number of incoming edges) for each node
/// 2. Identify nodes with zero in-degree (no dependencies) and add them to a queue
/// 3. While the queue is not empty:
///    1. Remove a node from the queue and add it to the result order.
///    2. For each neighbor of the removed node, decrement its in-degree.
///    3. If any neighbor's in-degree becomes zero, add it to the queue.
/// 4. If all nodes are processed, return the order
/// 5. Otherwise, there must be a cycle, so identify and return nodes in the cycle
///
/// # Performance
///
/// Given that `V` is the number of vertices (nodes) and `E` is the number of edges in the graph:
///
/// * Time Complexity `O(V + E)`
/// * Space Complexity `O(V)`
///
/// # Returns
///
/// - `Ok(Vec<usize>)` - A vector of node indices in topological order if the graph is acyclic.
///   Nodes with no dependencies appear before nodes that depend on them.
///
/// - `Err(RoaringBitmap)` - A bitmap containing the indices of nodes involved in cycles if the
///   graph contains one or more cycles.
///
/// # Reference
///
/// Kahn, A. B. (1962). "Topological sorting of large networks".
/// Communications of the ACM, 5(11), 558–562.
/// DOI: [10.1145/368996.369025](https://doi.org/10.1145/368996.369025).
#[expect(clippy::cast_possible_truncation)]
pub(crate) fn topological_sort_in<A>(
    graph: &Graph,
    kind: EdgeKind,
    allocator: A,
) -> Result<Vec<usize, A>, RoaringBitmap>
where
    A: Allocator + Clone,
{
    // Calculate in-degree (number of incoming edges) for each node
    let mut indegree = alloc::vec::from_elem_in(0_u32, graph.node_count(), allocator.clone());
    for source in 0..graph.node_count() {
        for target in graph.outgoing_edges_by_index(kind, source) {
            indegree[target] += 1;
        }
    }

    // Initialize queue with nodes that have no dependencies (in-degree = 0)
    let mut queue = VecDeque::with_capacity_in(graph.node_count(), allocator.clone());
    for (node, &degree) in indegree.iter().enumerate() {
        if degree == 0 {
            queue.push_back(node);
        }
    }

    // Process nodes in order of zero in-degree
    let mut order = Vec::with_capacity_in(graph.node_count(), allocator);
    while let Some(source) = queue.pop_front() {
        order.push(source);

        // For each outgoing edge, decrement the in-degree of the target
        for target in graph.outgoing_edges_by_index(kind, source) {
            indegree[target] -= 1;

            // If target now has zero in-degree, add to queue
            if indegree[target] == 0 {
                queue.push_back(target);
            }
        }
    }

    // If we processed all nodes, the graph is acyclic
    if order.len() == graph.node_count() {
        return Ok(order);
    }

    // Any node still with indegree>0 is in a cycle
    let cycle = indegree
        .into_iter()
        .enumerate()
        .filter(|&(_, degree)| degree > 0)
        .map(|(index, _)| index as u32)
        .collect();

    Err(cycle)
}

#[cfg(test)]
pub(crate) fn topological_sort(graph: &Graph, kind: EdgeKind) -> Result<Vec<usize>, RoaringBitmap> {
    topological_sort_in(graph, kind, alloc::alloc::Global)
}

#[cfg(test)]
mod tests {
    use super::topological_sort;
    use crate::r#type::inference::solver::graph::{EdgeKind, Graph};

    #[test]
    fn empty_graph() {
        let graph = Graph::from_edges([] as [&[_]; 0]);

        let result =
            topological_sort(&graph, EdgeKind::Any).expect("empty graph should not have cycles");
        assert!(result.is_empty());
    }

    #[test]
    fn single_node() {
        let graph = Graph::from_edges([&[]]);

        let result = topological_sort(&graph, EdgeKind::Any)
            .expect("single node graph should not have cycles");
        assert_eq!(result, [0]);
    }

    #[test]
    fn dag() {
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

        let result = topological_sort(&graph, EdgeKind::Any).expect("DAG should not have cycles");
        assert_eq!(result, [0, 2, 1, 3]);
    }

    #[test]
    fn cycle() {
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

        let result =
            topological_sort(&graph, EdgeKind::Any).expect_err("should have detected a cycle");
        assert_eq!(result.iter().collect::<Vec<_>>(), [0, 1, 2, 3, 4]);
    }

    #[test]
    fn disjoint_cycle() {
        // 0 -> 1 -> 0, 2 -> 3 -> 2
        let graph = Graph::from_edges([
            [1_u32], // Node 0 points to 1
            [0],     // Node 1 points to 0
            [3],     // Node 2 points to 3
            [2],     // Node 3 points to 2
        ]);

        let result =
            topological_sort(&graph, EdgeKind::Any).expect_err("should have detected a cycle");
        assert_eq!(result.iter().collect::<Vec<_>>(), [0, 1, 2, 3]);
    }
}
