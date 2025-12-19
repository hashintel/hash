use alloc::alloc::Global;
use core::alloc::Allocator;

use bitvec::{bitbox, boxed::BitBox};
use roaring::RoaringBitmap;

use super::graph::{EdgeKind, Graph};

/// Implementation of Tarjan's algorithm for finding strongly connected components (SCCs) in a
/// directed graph.
///
/// A strongly connected component is a subgraph where every node is reachable from every other
/// node. This implementation uses a single depth-first search pass to identify all SCCs in O(V+E)
/// time, where V is the number of vertices and E is the number of edges in the graph.
///
/// The algorithm uses several data structures to track the state of the search:
/// - Discovery indices to track when each node was first visited.
/// - Lowlink values to track the oldest node reachable from each node.
/// - A stack to track the current DFS path.
///
/// # References
///
/// - Tarjan, R. E. (1972). Depth-first search and linear graph algorithms. SIAM Journal on
///   Computing, 1(2), 146-160.
#[derive(Debug, Clone)]
pub(crate) struct Tarjan<'graph, A: Allocator = Global> {
    /// The directed graph.
    graph: &'graph Graph,
    /// The kind of edge to consider when computing SCCs.
    kind: EdgeKind,

    /// Next discovery index to assign to newly visited nodes.
    /// Each node gets a unique index in the order it's first visited.
    next_discovery_index: usize,

    /// Stack of nodes in the current DFS path, used to identify SCCs.
    node_stack: Vec<usize, A>,

    /// Bit vector tracking which nodes are currently on the stack.
    /// Provides O(1) membership testing compared to searching the stack.
    on_node_stack: BitBox,

    /// Discovery time for each node, recording when it was first visited.
    /// `discovery_time[node]` = the discovery index of `node`.
    discovery_time: Vec<usize, A>,

    /// Bit vector tracking which nodes have been visited.
    /// Using a `BitBox` instead of a `Vec<bool>` or `Option<usize>` reduces memory usage from 8
    /// bits to 1 bit per node.
    visited: BitBox,

    /// The lowest discovery time reachable from each node following tree edges and at most one
    /// back edge. This is key to identifying the root nodes of SCCs.
    lowlink: Vec<usize, A>,

    /// Collection of all identified strongly connected components.
    /// Each component is represented as a `RoaringBitmap` where set bits indicate nodes in the
    /// component.
    strongly_connected_components: Vec<RoaringBitmap, A>,
}

#[cfg(test)]
impl<'graph> Tarjan<'graph> {
    /// Creates a new Tarjan algorithm instance for the given graph.
    ///
    /// Initializes all the necessary data structures to track the state of the algorithm.
    /// The capacities of vectors are pre-allocated based on the graph size to minimize
    /// re-allocations during execution.
    pub(crate) fn new(graph: &'graph Graph, kind: EdgeKind) -> Self {
        Self::new_in(graph, kind, alloc::alloc::Global)
    }
}

impl<'graph, A> Tarjan<'graph, A>
where
    A: Allocator,
{
    const EXPECTED_SCC_RATIO: usize = 4;

    /// Creates a new Tarjan algorithm instance for the given graph in the given allocator.
    ///
    /// Initializes all the necessary data structures to track the state of the algorithm.
    /// The capacities of vectors are pre-allocated based on the graph size to minimize
    /// re-allocations during execution.
    #[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
    pub(crate) fn new_in(graph: &'graph Graph, kind: EdgeKind, allocator: A) -> Self
    where
        A: Clone,
    {
        let node_count = graph.node_count();

        Self {
            graph,
            kind,
            next_discovery_index: 0,
            node_stack: Vec::with_capacity_in(
                node_count / Self::EXPECTED_SCC_RATIO,
                allocator.clone(),
            ),
            on_node_stack: bitbox![0; node_count],
            discovery_time: alloc::vec::from_elem_in(0, node_count, allocator.clone()),
            visited: bitbox![0; node_count],
            lowlink: alloc::vec::from_elem_in(0, node_count, allocator.clone()),
            strongly_connected_components: Vec::with_capacity_in(
                node_count / Self::EXPECTED_SCC_RATIO,
                allocator,
            ),
        }
    }

    /// Runs Tarjan's algorithm and returns all strongly connected components (SCCs) in the graph.
    ///
    /// This method drives the full algorithm, performing a depth-first search from each
    /// unvisited node to discover all SCCs. The resulting components are returned as
    /// a vector of `RoaringBitmap`s, where each `RoaringBitmap` represents one SCC with bits set
    /// for the nodes in that component.
    ///
    /// # Returns
    ///
    /// A vector of strongly connected components, each represented as a `RoaringBitmap` where
    /// the bits corresponding to nodes in the component are set to true.
    ///
    /// # Complexity
    ///
    /// * Time: O(V + E) where V is the number of vertices and E is the number of edges
    /// * Space: O(V) additional space beyond the input graph
    pub(crate) fn compute(mut self) -> Vec<RoaringBitmap, A> {
        let total_nodes = self.graph.node_count();

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
        for neighbour in self.graph.outgoing_edges_by_index(self.kind, node) {
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
            } else {
                // Forward/cross edge: Neighbor is visited but not on stack
                // These edges don't contribute to the current SCC, so we ignore them
            }

            // Note: Forward/cross edges (to visited nodes not on stack) are ignored
            // as they do not contribute to the current SCC
        }

        // 3) If `node` is a root of an SCC (has same lowlink and discovery time),
        // extract the entire component from the stack
        if self.lowlink[node] == self.discovery_time[node] {
            let mut component = RoaringBitmap::new();

            // Pop nodes from the stack until we find the current node,
            // all these nodes form a single strongly connected component
            #[expect(clippy::cast_possible_truncation, reason = "we always work with u32")]
            while let Some(popped) = self.node_stack.pop() {
                self.on_node_stack.set(popped, false);
                component.insert(popped as u32);

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
    use roaring::RoaringBitmap;

    use crate::r#type::inference::solver::{
        graph::{EdgeKind, Graph},
        tarjan::Tarjan,
    };

    /// Helper function to create a directed graph from an adjacency list.
    fn create_graph(
        adjacency_list: impl IntoIterator<Item: AsRef<[u32]>, IntoIter: ExactSizeIterator>,
    ) -> Graph {
        Graph::from_edges(adjacency_list)
    }

    /// Helper function to compare SCCs regardless of their order.
    fn assert_sccs_equal(
        actual: &[RoaringBitmap],
        expected: impl IntoIterator<Item: AsRef<[u32]>>,
    ) {
        let mut expected: Vec<RoaringBitmap> = expected
            .into_iter()
            .map(|component| {
                let mut map = RoaringBitmap::new();

                for &node in component.as_ref() {
                    map.insert(node);
                }

                map
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
                    expected[index] = RoaringBitmap::new();
                    found = true;

                    break;
                }
            }

            assert!(
                found,
                "Couldn't find matching SCC for {:?}",
                actual.iter().collect::<Vec<_>>()
            );
        }

        assert!(
            expected.iter().all(roaring::RoaringBitmap::is_empty),
            "Not all expected SCCs were found"
        );
    }

    #[test]
    fn empty_graph() {
        let graph = create_graph([] as [&[u32]; 0]);
        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_eq!(sccs.len(), 0);
    }

    #[test]
    fn single_node() {
        let graph = create_graph([[]]);
        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [[0]]);
    }

    #[test]
    fn single_node_self_loop() {
        let graph = create_graph([[0]]);
        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [[0]]);
    }

    #[test]
    fn two_node_cycle() {
        let graph = create_graph([[1], [0]]);
        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [[0, 1]]);
    }

    #[test]
    fn directed_line() {
        let graph = create_graph([&[1], &[2], &[] as &[_]]);
        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [[0], [1], [2]]);
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

        let mut adjacency_list: [&mut [u32]; 8] = [
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

        let mut expected: [&mut [u32]; 3] = [&mut [1, 2, 8], &mut [3, 4, 5, 7], &mut [6]];

        for component in &mut expected {
            for node in component.iter_mut() {
                *node -= 1;
            }
        }

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, expected);
    }

    #[test]
    fn disconnected_graph() {
        let graph = create_graph([
            [], // 0
            [], // 1
            [], // 2
        ]);

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [[0], [1], [2]]);
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

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [&[0_u32, 1, 2] as &[_], &[3, 4, 5]]);
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
            &[1_u32] as &[_], // 0 -> 1
            &[2, 3],          // 1 -> 2, 3
            &[0],             // 2 -> 0
            &[4],             // 3 -> 4
            &[5],             // 4 -> 5
            &[6],             // 5 -> 6
            &[4],             // 6 -> 4
        ]);

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [&[0_u32, 1, 2] as &[_], &[4, 5, 6], &[3]]);
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
        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();

        // The entire graph should be one SCC
        let expected = [(0..1000).collect::<Vec<_>>()];
        assert_sccs_equal(&sccs, &expected);
    }

    #[test]
    fn acyclic_graph() {
        // A directed acyclic graph (DAG)
        // 0 -> 1 -> 3
        // |    |
        // v    v
        // 2 -> 4
        let graph = create_graph([
            &[1_u32, 2] as &[_], // 0 -> 1, 2
            &[3, 4],             // 1 -> 3, 4
            &[4],                // 2 -> 4
            &[],                 // 3
            &[],                 // 4
        ]);

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();

        // In a DAG, each node should be its own SCC
        assert_sccs_equal(&sccs, [[0], [1], [2], [3], [4]]);
    }

    #[test]
    fn dense_graph() {
        // Create a dense graph where each node is connected to every other node
        let node_count: u32 = 10;
        let mut adjacency_list = Vec::with_capacity(node_count as usize);

        for i in 0..node_count {
            let mut neighbors = Vec::with_capacity(node_count as usize - 1);
            for j in 0..node_count {
                if i != j {
                    neighbors.push(j);
                }
            }
            adjacency_list.push(neighbors);
        }

        let graph = create_graph(&adjacency_list);
        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();

        // The entire graph should be one SCC
        let expected = [(0..node_count).collect::<Vec<_>>()];
        assert_sccs_equal(&sccs, &expected);
    }

    #[test]
    #[expect(clippy::integer_division_remainder_used, clippy::integer_division)]
    fn benchmark_large_graph() {
        // This test is more of a benchmark to see if the implementation handles large graphs
        // efficiently
        let node_count: u32 = 10000;
        let mut adjacency_list = Vec::with_capacity(node_count as usize);

        // Create a large graph with a lot of small SCCs
        for i in 0..node_count {
            if i.is_multiple_of(2) {
                adjacency_list.push([(i + 1) % node_count]);
            } else {
                adjacency_list.push([(i - 1) % node_count]);
            }
        }

        let graph = create_graph(&adjacency_list);
        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();

        // The graph should have node_count/2 SCCs, each with 2 nodes
        assert_eq!(sccs.len(), node_count as usize / 2);

        // Verify each SCC has exactly 2 nodes
        for scc in &sccs {
            assert_eq!(scc.len(), 2);
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
            &[1_u32, 2] as &[_], // 0 -> 1, 2
            &[3, 4],             // 1 -> 3, 4
            &[5],                // 2 -> 5
            &[6],                // 3 -> 6
            &[6],                // 4 -> 6
            &[6],                // 5 -> 6
            &[5],                // 6 -> 5
        ]);

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [&[0_u32] as &[_], &[1], &[2], &[3], &[4], &[5, 6]]);
    }

    #[test]
    fn scc_with_entry_and_exit_points() {
        // A graph with an SCC and entry/exit points
        // 0 -> 1 -> 2 -> 3
        //      ^    |
        //      |    v
        //      +--- 4
        let graph = create_graph([
            &[1_u32] as &[_], // 0 -> 1
            &[2],             // 1 -> 2
            &[3, 4],          // 2 -> 3, 4
            &[],              // 3
            &[1],             // 4 -> 1
        ]);

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [&[0_u32] as &[_], &[1, 2, 4], &[3]]);
    }

    #[test]
    fn multiple_connected_components() {
        // A graph with multiple connected components
        // Component 1: 0 -> 1 -> 2 -> 0
        // Component 2: 3 -> 4
        // Component 3: 5 -> 6 -> 5, 7
        let graph = create_graph([
            &[1_u32] as &[_], // 0 -> 1
            &[2],             // 1 -> 2
            &[0],             // 2 -> 0
            &[4],             // 3 -> 4
            &[],              // 4
            &[6],             // 5 -> 6
            &[5, 7],          // 6 -> 5, 7
            &[],              // 7
        ]);

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [&[0_u32, 1, 2] as &[_], &[3], &[4], &[5, 6], &[7]]);
    }

    #[test]
    fn scc_order() {
        // 0 → 1 → 2 → 0     (SCC1)
        // 2 → 3             (SCC1 → SCC2)
        // 3 → 4 → 5 → 3     (SCC2)
        // 5 → 6             (SCC2 → SCC3)
        let graph = create_graph([
            &[1_u32] as &[_], // 0 -> 1
            &[2],             // 1 -> 2
            &[0, 3],          // 2 -> 0, 3
            &[4],             // 3 -> 4
            &[5],             // 4 -> 5
            &[3, 6],          // 5 -> 3, 5 -> 6
            &[],
        ]);

        let sccs = Tarjan::new(&graph, EdgeKind::Any).compute();
        assert_sccs_equal(&sccs, [&[6_u32] as &[_], &[3, 4, 5], &[0, 1, 2]]);
    }
}
