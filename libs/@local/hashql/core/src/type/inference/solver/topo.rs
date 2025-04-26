use alloc::collections::VecDeque;

use roaring::RoaringBitmap;

use super::graph::Graph;

/// Performs a topological sort on the graph.
///
/// If the graph is acyclic, returns a vector of nodes in topological order
/// (where dependencies come before dependents).
///
/// If the graph contains cycles, returns the nodes involved in a cycle.
#[expect(clippy::cast_possible_truncation)]
pub(crate) fn topological_sort(graph: &Graph) -> Result<Vec<usize>, RoaringBitmap> {
    let mut indegree = vec![0; graph.node_count()];
    for source in 0..graph.node_count() {
        for target in graph.outgoing_edges_by_index(source) {
            indegree[target] += 1;
        }
    }

    let mut queue = VecDeque::new();
    for (node, &degree) in indegree.iter().enumerate() {
        if degree == 0 {
            queue.push_back(node);
        }
    }

    let mut order = Vec::with_capacity(graph.node_count());
    while let Some(source) = queue.pop_front() {
        order.push(source);

        for target in graph.outgoing_edges_by_index(source) {
            indegree[target] -= 1;

            if indegree[target] == 0 {
                queue.push_back(target);
            }
        }
    }

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
mod tests {
    use super::topological_sort;
    use crate::r#type::inference::solver::graph::Graph;

    #[test]
    fn empty_graph() {
        let graph = Graph::from_edges([] as [&[_]; 0]);

        let result = topological_sort(&graph).expect("empty graph should not have cycles");
        assert!(result.is_empty());
    }

    #[test]
    fn single_node() {
        let graph = Graph::from_edges([&[]]);

        let result = topological_sort(&graph).expect("single node graph should not have cycles");
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

        let result = topological_sort(&graph).expect("DAG should not have cycles");
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

        let result = topological_sort(&graph).expect_err("should have detected a cycle");
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

        let result = topological_sort(&graph).expect_err("should have detected a cycle");
        assert_eq!(result.iter().collect::<Vec<_>>(), [0, 1, 2, 3]);
    }
}
