use bitvec::{bitbox, boxed::BitBox};

/// Implementation of Tarjan's algorithm for finding strongly connected components (SCCs) in a
/// directed graph.
///
/// A strongly connected component is a subgraph where every node is reachable from every other
/// node. This implementation uses a single depth-first search pass to identify all SCCs in O(V+E)
/// time, where V is the number of vertices and E is the number of edges in the graph.
///
/// The algorithm uses several data structures to track the state of the search:
/// - Discovery indices to track when each node was first visited
/// - Lowlink values to track the oldest node reachable from each node
/// - A stack to track the current DFS path
///
/// # References
///
/// - Tarjan, R. E. (1972). Depth-first search and linear graph algorithms. SIAM Journal on
///   Computing, 1(2), 146-160.
#[derive(Debug, Clone)]
pub(crate) struct Tarjan<'graph> {
    /// The directed graph represented as adjacency lists using bit vectors.
    /// Each `BitBox` represents the outgoing edges from a node, where a set bit indicates an edge.
    graph: &'graph [BitBox],

    /// Next discovery index to assign to newly visited nodes.
    /// Each node gets a unique index in the order it's first visited.
    next_discovery_index: usize,

    /// Stack of nodes in the current DFS path, used to identify SCCs.
    node_stack: Vec<usize>,

    /// Bit vector tracking which nodes are currently on the stack.
    /// Provides O(1) membership testing compared to searching the stack.
    on_node_stack: BitBox,

    /// Discovery time for each node, recording when it was first visited.
    /// `discovery_time[node]` = the discovery index of `node`.
    discovery_time: Vec<usize>,

    /// Bit vector tracking which nodes have been visited.
    /// Using a `BitBox` instead of a `Vec<bool>` or `Option<usize>` reduces memory usage from 8
    /// bits to 1 bit per node.
    visited: BitBox,

    /// The lowest discovery time reachable from each node following tree edges and at most one
    /// back edge. This is key to identifying the root nodes of SCCs.
    lowlink: Vec<usize>,

    /// Collection of all identified strongly connected components.
    /// Each component is represented as a `BitBox` where set bits indicate nodes in the component.
    strongly_connected_components: Vec<BitBox>,
}

impl<'graph> Tarjan<'graph> {
    /// Creates a new Tarjan algorithm instance for the given graph.
    ///
    /// Initializes all the necessary data structures to track the state of the algorithm.
    /// The capacities of vectors are pre-allocated based on the graph size to minimize
    /// reallocations during execution.
    ///
    /// # Arguments
    ///
    /// * `graph` - The directed graph represented as a slice of `BitBoxe`s where each `BitBox`
    ///   represents the outgoing edges from a node.
    #[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
    pub(crate) fn new(graph: &'graph [BitBox]) -> Self {
        let node_count = graph.len();
        Tarjan {
            graph,
            next_discovery_index: 0,
            node_stack: Vec::with_capacity(node_count / 4),
            on_node_stack: bitbox![0; node_count],
            discovery_time: vec![0; node_count],
            visited: bitbox![0; node_count],
            lowlink: vec![0; node_count],
            strongly_connected_components: Vec::with_capacity(node_count / 4),
        }
    }

    /// Runs Tarjan's algorithm and returns all strongly connected components (SCCs) in the graph.
    ///
    /// This method drives the full algorithm, performing a depth-first search from each
    /// unvisited node to discover all SCCs. The resulting components are returned as
    /// a vector of `BitBox`es, where each `BitBox` represents one SCC with bits set for
    /// the nodes in that component.
    ///
    /// # Returns
    ///
    /// A vector of strongly connected components, each represented as a `BitBox` where
    /// the bits corresponding to nodes in the component are set to true.
    ///
    /// # Complexity
    ///
    /// * Time: O(V + E) where V is the number of vertices and E is the number of edges
    /// * Space: O(V) additional space beyond the input graph
    pub(crate) fn compute(mut self) -> Vec<BitBox> {
        let total_nodes = self.graph.len();

        for node in 0..total_nodes {
            if !self.visited[node] {
                self.visit_node(node);
            }
        }

        self.strongly_connected_components
    }

    /// Performs a recursive depth-first search to compute strongly connected components.
    ///
    /// This is the core of Tarjan's algorithm. For each node, it:
    /// 1. Assigns discovery and lowlink values
    /// 2. Pushes the node onto the DFS stack
    /// 3. Recursively visits all unvisited neighbors
    /// 4. Updates lowlink values based on back edges to nodes in the current DFS path
    /// 5. Identifies and extracts SCCs when a root node is found (`lowlink == discovery_time`)
    ///
    /// # Arguments
    ///
    /// * `node` - The current node being visited
    ///
    /// # Implementation Notes
    ///
    /// The algorithm distinguishes between different types of edges:
    /// - Tree edges: Edges to unvisited nodes (continue DFS recursion).
    /// - Back edges: Edges to nodes already in the current DFS path (update lowlink).
    /// - Forward/cross edges: Edges to nodes already visited but not in current path (ignored).
    fn visit_node(&mut self, node: usize) {
        // 1) Initialize discovery/lowlink values for this node
        // Each node gets a unique discovery index in the order it's first visited
        let current_index = self.next_discovery_index;
        self.discovery_time[node] = current_index;
        self.lowlink[node] = current_index; // Initially, a node can only reach itself
        self.next_discovery_index += 1;

        // Add node to the DFS stack and mark it as visited
        self.node_stack.push(node);
        self.on_node_stack.set(node, true); // Track stack membership with O(1) lookups
        self.visited.set(node, true);

        // 2) Explore all outbound neighbors and update lowlink values
        for neighbour in self.graph[node].iter_ones() {
            if !self.visited[neighbour] {
                // Tree edge: Neighbor hasn't been visited yet, so recursively process it

                self.visit_node(neighbour);
                // Update the current node's lowlink based on the neighbor's lowlink
                // This propagates the information about reachable nodes upstream
                self.lowlink[node] = self.lowlink[node].min(self.lowlink[neighbour]);
            } else if self.on_node_stack[neighbour] {
                // Back edge: Neighbor is already on the stack, which means we've found a cycle
                // Update the lowlink to potentially include the neighbor in the current SCC

                let neighbor_discovery = self.discovery_time[neighbour];
                self.lowlink[node] = self.lowlink[node].min(neighbor_discovery);
            }

            // Note: Forward/cross edges (to visited nodes not on stack) are ignored
            // as they do not contribute to the current SCC
        }

        // 3) If `node` is a root of an SCC (has same lowlink and discovery time),
        // extract the entire component from the stack
        if self.lowlink[node] == self.discovery_time[node] {
            let mut component = bitbox![0; self.graph.len()];

            // Pop nodes from the stack until we find the current node,
            // all these nodes form a single strongly connected component
            while let Some(popped) = self.node_stack.pop() {
                self.on_node_stack.set(popped, false);
                component.set(popped, true);

                if popped == node {
                    break; // We've found the root node, SCC is complete
                }
            }

            self.strongly_connected_components.push(component);
        }
    }
}

#[cfg(test)]
mod test {
    use bitvec::{bitbox, boxed::BitBox};

    use crate::r#type::inference::tarjan::Tarjan;

    /// Helper function to create a directed graph from an adjacency list
    fn create_graph(
        adjacency_list: impl IntoIterator<Item: AsRef<[usize]>, IntoIter: ExactSizeIterator>,
    ) -> Vec<BitBox> {
        let adjacency_list = adjacency_list.into_iter();
        let node_count = adjacency_list.len();

        let mut graph = Vec::with_capacity(node_count);

        for neighbors in adjacency_list {
            let mut bitbox = bitbox![0; node_count];

            for &neighbor in neighbors.as_ref() {
                bitbox.set(neighbor, true);
            }

            graph.push(bitbox);
        }

        graph
    }

    /// Helper function to compare SCCs regardless of their order
    fn assert_sccs_equal(
        actual: &[BitBox],
        expected: impl IntoIterator<Item: AsRef<[usize]>>,
        node_count: usize,
    ) {
        let mut expected: Vec<BitBox> = expected
            .into_iter()
            .map(|component| {
                let mut r#box = bitbox![0; node_count];

                for &node in component.as_ref() {
                    r#box.set(node, true);
                }

                r#box
            })
            .collect();

        assert_eq!(
            actual.len(),
            expected.len(),
            "Number of SCCs doesn't match. Expected: {}, Actual: {}",
            expected.len(),
            actual.len()
        );

        // For each actual SCC, find matching expected SCC and remove it
        for actual in actual {
            let mut found = false;
            for (index, component) in expected.iter().enumerate() {
                if actual == component {
                    expected[index] = bitbox![0; node_count];
                    found = true;

                    break;
                }
            }

            assert!(
                found,
                "Couldn't find matching SCC for {:?}",
                actual.iter_ones().collect::<Vec<_>>()
            );
        }

        assert!(
            expected.iter().all(|scc| scc.first_one().is_none()),
            "Not all expected SCCs were found"
        );
    }

    #[test]
    fn empty_graph() {
        let graph = Vec::new();
        let sccs = Tarjan::new(&graph).compute();
        assert_eq!(sccs.len(), 0);
    }

    #[test]
    fn single_node() {
        let graph = create_graph([[]]);
        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, [[0]], 1);
    }

    #[test]
    fn single_node_self_loop() {
        let graph = create_graph([[0]]);
        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, [[0]], 1);
    }

    #[test]
    fn two_node_cycle() {
        let graph = create_graph([[1], [0]]);
        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, [[0, 1]], 2);
    }

    #[test]
    fn directed_line() {
        let graph = create_graph([&[1], &[2], &[] as &[_]]);
        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, [[0], [1], [2]], 3);
    }

    #[test]
    fn complex_graph() {
        // doi: 10.1137/0201010, fig 3
        // 1 -> 2
        // 2 -> 3
        // 2 -> 8
        // 3 -> 4
        // 3 -> 7
        // 4 -> 5
        // 5 -> 3
        // 5 -> 6
        // 7 -> 4
        // 7 -> 6
        // 8 -> 1
        // 8 -> 7

        let mut adjacency_list: [&mut [usize]; _] = [
            &mut [2],    // 1 -> 2
            &mut [3, 8], // 2 -> 3, 2 -> 8
            &mut [4, 7], // 3 -> 4, 3 -> 7
            &mut [5],    // 4 -> 5
            &mut [3, 6], // 5 -> 3, 5 -> 6
            &mut [],
            &mut [4, 6], // 7 -> 4, 7 -> 6
            &mut [1, 7], // 8 -> 1, 8 -> 7
        ];

        // We need to decrement the indices
        for outgoing in &mut adjacency_list {
            for node in outgoing.iter_mut() {
                *node -= 1;
            }
        }

        let graph = create_graph(adjacency_list);

        let mut expected: [&mut [usize]; _] = [&mut [1, 2, 8], &mut [3, 4, 5, 7], &mut [6]];

        for component in &mut expected {
            for node in component.iter_mut() {
                *node -= 1;
            }
        }

        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, expected, 8);
    }

    #[test]
    fn disconnected_graph() {
        let graph = create_graph([
            [], // 0
            [], // 1
            [], // 2
        ]);

        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, [[0], [1], [2]], 3);
    }

    #[test]
    fn multiple_sccs() {
        // 0 -> 1 -> 2 -> 0
        // 3 -> 4 -> 5 -> 3
        let graph = create_graph([
            [1], // 0 -> 1
            [2], // 1 -> 2
            [0], // 2 -> 0
            [4], // 3 -> 4
            [5], // 4 -> 5
            [3], // 5 -> 3
        ]);

        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, [&[0_usize, 1, 2] as &[_], &[3, 4, 5]], 6);
    }

    #[test]
    fn nested_components() {
        // 0 -> 1 -> 3
        // ^    |    |
        // |    v    v
        // +--- 2    4 -> 5
        //           ^    |
        //           |    v
        //           +--- 6
        let graph = create_graph([
            &[1_usize] as &[_], // 0 -> 1
            &[2, 3],            // 1 -> 2, 3
            &[0],               // 2 -> 0
            &[4],               // 3 -> 4
            &[5],               // 4 -> 5
            &[6],               // 5 -> 6
            &[4],               // 6 -> 4
        ]);

        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, [&[0_usize, 1, 2] as &[_], &[4, 5, 6], &[3]], 7);
    }

    #[test]
    #[expect(clippy::integer_division_remainder_used)]
    fn large_graph() {
        // Create a graph with 1000 nodes, each connected to the next to form a cycle
        let mut adjacency_list = Vec::with_capacity(1000);
        for i in 0..1000 {
            adjacency_list.push([(i + 1) % 1000]);
        }

        let graph = create_graph(&adjacency_list);
        let sccs = Tarjan::new(&graph).compute();

        // The entire graph should be one SCC
        let expected = [(0..1000).collect::<Vec<_>>()];
        assert_sccs_equal(&sccs, &expected, 1000);
    }

    #[test]
    fn acyclic_graph() {
        // A directed acyclic graph (DAG)
        // 0 -> 1 -> 3
        // |    |
        // v    v
        // 2 -> 4
        let graph = create_graph([
            &[1_usize, 2] as &[usize], // 0 -> 1, 2
            &[3, 4],                   // 1 -> 3, 4
            &[4],                      // 2 -> 4
            &[],                       // 3
            &[],                       // 4
        ]);

        let sccs = Tarjan::new(&graph).compute();

        // In a DAG, each node should be its own SCC
        assert_sccs_equal(&sccs, [[0], [1], [2], [3], [4]], 5);
    }

    #[test]
    fn dense_graph() {
        // Create a dense graph where each node is connected to every other node
        let node_count = 10;
        let mut adjacency_list = Vec::with_capacity(node_count);

        for i in 0..node_count {
            let mut neighbors = Vec::with_capacity(node_count - 1);
            for j in 0..node_count {
                if i != j {
                    neighbors.push(j);
                }
            }
            adjacency_list.push(neighbors);
        }

        let graph = create_graph(&adjacency_list);
        let sccs = Tarjan::new(&graph).compute();

        // The entire graph should be one SCC
        let expected = [(0..node_count).collect::<Vec<_>>()];
        assert_sccs_equal(&sccs, &expected, node_count);
    }

    #[test]
    #[expect(clippy::integer_division_remainder_used, clippy::integer_division)]
    fn benchmark_large_graph() {
        // This test is more of a benchmark to see if the implementation handles large graphs
        // efficiently
        let node_count = 10000;
        let mut adjacency_list = Vec::with_capacity(node_count);

        // Create a large graph with a lot of small SCCs
        for i in 0..node_count {
            if i % 2 == 0 {
                adjacency_list.push([(i + 1) % node_count]);
            } else {
                adjacency_list.push([(i - 1) % node_count]);
            }
        }

        let graph = create_graph(&adjacency_list);
        let sccs = Tarjan::new(&graph).compute();

        // The graph should have node_count/2 SCCs, each with 2 nodes
        assert_eq!(sccs.len(), node_count / 2);

        // Verify each SCC has exactly 2 nodes
        for scc in &sccs {
            assert_eq!(scc.count_ones(), 2);
        }
    }

    #[test]
    fn tree_with_back_edges() {
        // A tree with some back edges creating SCCs
        //     0
        //    / \
        //   1   2
        //  / \   \
        // 3   4   5
        //  \ /    |
        //   6     |
        //   |     |
        //   +-----+
        let graph = create_graph([
            &[1_usize, 2] as &[_], // 0 -> 1, 2
            &[3, 4],               // 1 -> 3, 4
            &[5],                  // 2 -> 5
            &[6],                  // 3 -> 6
            &[6],                  // 4 -> 6
            &[6],                  // 5 -> 6
            &[5],                  // 6 -> 5
        ]);

        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(
            &sccs,
            [&[0_usize] as &[_], &[1], &[2], &[3], &[4], &[5, 6]],
            7,
        );
    }

    #[test]
    fn scc_with_entry_and_exit_points() {
        // A graph with an SCC and entry/exit points
        // 0 -> 1 -> 2 -> 3
        //      ^    |
        //      |    v
        //      +--- 4
        let graph = create_graph([
            &[1_usize] as &[_], // 0 -> 1
            &[2],               // 1 -> 2
            &[3, 4],            // 2 -> 3, 4
            &[],                // 3
            &[1],               // 4 -> 1
        ]);

        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(&sccs, [&[0_usize] as &[usize], &[1, 2, 4], &[3]], 5);
    }

    #[test]
    fn multiple_connected_components() {
        // A graph with multiple connected components
        // Component 1: 0 -> 1 -> 2 -> 0
        // Component 2: 3 -> 4
        // Component 3: 5 -> 6 -> 5, 7
        let graph = create_graph([
            &[1_usize] as &[_], // 0 -> 1
            &[2],               // 1 -> 2
            &[0],               // 2 -> 0
            &[4],               // 3 -> 4
            &[],                // 4
            &[6],               // 5 -> 6
            &[5, 7],            // 6 -> 5, 7
            &[],                // 7
        ]);

        let sccs = Tarjan::new(&graph).compute();
        assert_sccs_equal(
            &sccs,
            [&[0_usize, 1, 2] as &[_], &[3], &[4], &[5, 6], &[7]],
            8,
        );
    }
}
