use super::DominatorFrontiers;
use crate::{
    collections::WorkQueue,
    graph::DirectedGraph,
    id::{Id, bit_vec::MixedBitSet},
};

/// Computes the iterated dominance frontier (IDF) for a set of nodes.
///
/// The iterated dominance frontier of a set S is the fixed point of repeatedly taking the
/// dominance frontier. Formally:
///
/// ```text
/// IDF(S) = DF(S) ∪ DF(DF(S)) ∪ DF(DF(DF(S))) ∪ ...
/// ```
///
/// This is equivalent to computing:
///
/// ```text
/// IDF(S) = DF+(S) where DF+(S) = DF(S ∪ DF+(S))
/// ```
///
/// # Use in SSA Construction
///
/// The IDF is primarily used in SSA (Static Single Assignment) construction to determine where
/// φ-functions need to be inserted. Given a variable that is defined at a set of nodes S,
/// φ-functions must be placed at every node in IDF(S).
///
/// For example, consider:
///
/// ```text
///       0 (x = 1)
///      / \
///     1   2 (x = 2)
///      \ /
///       3
///       |
///       4
/// ```
///
/// If variable `x` is defined at nodes 0 and 2:
/// - DF({0, 2}) = {3} (both paths merge at 3)
/// - DF({0, 2, 3}) = {3} (fixed point reached)
/// - Therefore IDF({0, 2}) = {3}
///
/// A φ-function for `x` is needed at node 3: `x = φ(x_from_1, x_from_2)`
///
/// # Algorithm
///
/// Uses a worklist algorithm that processes nodes until reaching a fixed point:
/// 1. Initialize the worklist with all nodes in the input set
/// 2. For each node in the worklist, add its dominance frontier to the result
/// 3. Any newly discovered frontier nodes are added to the worklist
/// 4. Continue until the worklist is empty
///
/// # Complexity
///
/// - Time: `O(|S| × |DF_max|)` where `|DF_max|` is the maximum frontier size
/// - Space: `O(|V|)` for the visited set
///
/// # Arguments
///
/// * `nodes` - The set of nodes to compute the iterated frontier for (typically definition sites)
/// * `frontiers` - Pre-computed dominance frontiers for the graph
/// * `node_count` - Total number of nodes in the graph
///
/// # Returns
///
/// A sorted vector of node IDs representing the iterated dominance frontier.
pub fn iterated_dominance_frontier<G: DirectedGraph>(
    graph: &G,
    frontiers: &DominatorFrontiers<G::NodeId>,
    nodes: impl IntoIterator<Item = G::NodeId>,
) -> IteratedDominanceFrontier<G::NodeId> {
    let mut result = MixedBitSet::new_empty(graph.node_count());

    let mut queue = WorkQueue::new(graph.node_count());
    queue.extend(nodes);

    while let Some(node) = queue.dequeue() {
        for frontier_node in frontiers.frontier(node) {
            // Check if the value is already in the result set, if this is the case, we can skip
            // this step, as it will be superfluous
            if !result.insert(frontier_node) {
                continue;
            }

            queue.enqueue(frontier_node);
        }
    }

    IteratedDominanceFrontier { inner: result }
}

/// The iterated dominance frontier of a set of nodes.
///
/// Created by [`iterated_dominance_frontier`] and contains all nodes where φ-functions
/// may need to be inserted during SSA construction.
pub struct IteratedDominanceFrontier<N> {
    inner: MixedBitSet<N>,
}

impl<N> IteratedDominanceFrontier<N>
where
    N: Id,
{
    /// Returns `true` if the iterated dominance frontier is empty.
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Returns the number of nodes in the iterated dominance frontier.
    pub fn count(&self) -> usize {
        self.inner.count()
    }

    /// Returns the underlying [`MixedBitSet`].
    pub const fn as_inner(&self) -> &MixedBitSet<N> {
        &self.inner
    }

    /// Returns an iterator over the nodes in this iterated dominance frontier.
    pub fn iter(&self) -> impl Iterator<Item = N> {
        self.inner.iter()
    }
}

impl<N> IntoIterator for &IteratedDominanceFrontier<N>
where
    N: Id,
{
    type Item = N;

    type IntoIter = impl Iterator<Item = N>;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{
        NodeId,
        algorithms::dominators::{dominance_frontiers, dominators},
        tests::TestGraph,
    };

    macro_rules! n {
        ($expr:expr) => {
            NodeId::new($expr)
        };
    }

    #[test]
    fn empty_set() {
        // 0 --> 1 --> 2
        let graph = TestGraph::new(&[(0, 1), (1, 2)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        let idf = iterated_dominance_frontier(&graph, &frontiers, core::iter::empty::<NodeId>());
        assert!(idf.is_empty());
    }

    #[test]
    fn single_node_no_frontier() {
        // 0 --> 1 --> 2
        //
        // Node 0 has no frontier (dominates everything).
        let graph = TestGraph::new(&[(0, 1), (1, 2)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        let idf = iterated_dominance_frontier(&graph, &frontiers, [n!(0)]);
        assert!(idf.is_empty());
    }

    #[test]
    fn diamond() {
        //       0
        //      / \
        //     v   v
        //     1   2
        //      \ /
        //       v
        //       3
        //
        // DF(1) = {3}, DF(2) = {3}
        // IDF({1}) = {3}
        // IDF({2}) = {3}
        // IDF({1, 2}) = {3}
        let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 3)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(1)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(3)]
        );
        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(2)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(3)]
        );
        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(1), n!(2)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(3)]
        );
    }

    #[test]
    fn chain_of_diamonds() {
        //       0
        //      / \
        //     v   v
        //     1   2
        //      \ /
        //       v
        //       3
        //      / \
        //     v   v
        //     4   5
        //      \ /
        //       v
        //       6
        //
        // DF(1) = {3}, DF(4) = {6}
        // IDF({1, 4}) = {3, 6}
        let graph = TestGraph::new(&[
            (0, 1),
            (0, 2),
            (1, 3),
            (2, 3),
            (3, 4),
            (3, 5),
            (4, 6),
            (5, 6),
        ]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(1), n!(4)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(3), n!(6)]
        );
    }

    #[test]
    fn iteration_needed() {
        //       0
        //      / \
        //     v   v
        //     1   2
        //     |   |
        //     v   v
        //     3   4
        //      \ /
        //       v
        //       5
        //       |
        //       v
        //       6
        //
        // DF(1) = {5} (via 3)
        // DF(2) = {5} (via 4)
        // DF(5) = {} (no successors with multiple preds after it)
        //
        // But if we have:
        //       0
        //      / \
        //     1   4
        //     |   |
        //     2   |
        //     |\ /
        //     | 3
        //     |/
        //     5
        //
        // DF(1) = {5}, DF(2) = {3, 5}
        // IDF({1}) = DF({1}) ∪ DF(DF({1})) = {5} ∪ {} = {5}
        // IDF({2}) = {3, 5}
        let graph = TestGraph::new(&[(0, 1), (0, 4), (1, 2), (2, 3), (2, 5), (4, 3), (3, 5)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        // DF(2) = {3, 5} since 2's successors (3 and 5) both have multiple predecessors
        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(2)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(3), n!(5)]
        );
    }

    #[test]
    fn loop_with_definition() {
        //       0
        //       |
        //       v
        // +---->1
        // |     |
        // |     v
        // +-----2
        //       |
        //       v
        //       3
        //
        // DF(2) = {1} (back-edge)
        // IDF({2}) = {1}
        // IDF({0, 2}) = {1}
        let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 1), (2, 3)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(2)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(1)]
        );
        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(0), n!(2)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(1)]
        );
    }

    #[test]
    fn transitive_closure() {
        //         0
        //        /|\
        //       v v v
        //       1 2 3
        //       |   |
        //       v   v
        //       4   5
        //        \ /
        //         v
        //         6
        //         |
        //         v
        //         7
        //
        // DF(1) = {6} (via 4)
        // DF(3) = {6} (via 5)
        // DF(6) = {7}? No, 7 has single predecessor
        //
        // Let's use a graph where iteration is clearly needed:
        //
        //       0
        //      / \
        //     1   2
        //     |\ /|
        //     | X |
        //     |/ \|
        //     3   4
        //      \ /
        //       5
        //
        // Edges: 0->1, 0->2, 1->3, 1->4, 2->3, 2->4, 3->5, 4->5
        // DF(1) = {3, 4} (both 3 and 4 have preds from 2)
        // DF(3) = {5}, DF(4) = {5}
        // IDF({1}) = {3, 4} ∪ DF({3, 4}) = {3, 4} ∪ {5} = {3, 4, 5}
        let graph = TestGraph::new(&[
            (0, 1),
            (0, 2),
            (1, 3),
            (1, 4),
            (2, 3),
            (2, 4),
            (3, 5),
            (4, 5),
        ]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        // Verify DF(1) = {3, 4}
        assert_eq!(
            frontiers.frontier(n!(1)).iter().collect::<Vec<_>>(),
            [n!(3), n!(4)]
        );
        // Verify DF(3) = {5}, DF(4) = {5}
        assert_eq!(
            frontiers.frontier(n!(3)).iter().collect::<Vec<_>>(),
            [n!(5)]
        );
        assert_eq!(
            frontiers.frontier(n!(4)).iter().collect::<Vec<_>>(),
            [n!(5)]
        );

        // IDF({1}) should include 3, 4 (from DF(1)) and 5 (from DF(3) and DF(4))
        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(1)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(3), n!(4), n!(5)]
        );
    }

    #[test]
    fn nested_loops() {
        //        0
        //        |
        //        v
        // +----->1<----+
        // |      |     |
        // |      v     |
        // |  +-->2--+  |
        // |  |   |  |  |
        // |  +---3  |  |
        // |      |  |  |
        // |      v  |  |
        // +------4<-+  |
        // |      |     |
        // |      +-----+
        // |
        // +----->5
        //
        // Inner loop: 2->3->2
        // Outer loop: 1->2->4->1
        //
        // Simpler version:
        //     0
        //     |
        //     v
        // +-->1<--+
        // |   |   |
        // |   v   |
        // |   2---+
        // |   |
        // +---+
        //
        // DF(2) = {1} (back edge)
        // IDF({2}) = {1}
        // IDF({0, 2}) = {1}
        let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 1)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(2)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(1)]
        );
    }

    #[test]
    fn irreducible_cfg() {
        //       0
        //      / \
        //     v   v
        //     1<->2
        //      \ /
        //       v
        //       3
        //
        // DF(1) = {2, 3}, DF(2) = {1, 3}
        // IDF({1}) = {2, 3} ∪ DF({2, 3}) = {2, 3} ∪ {1, 3} = {1, 2, 3}
        let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 2), (2, 1), (1, 3), (2, 3)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        // In an irreducible CFG, the IDF can include the original nodes
        let idf = iterated_dominance_frontier(&graph, &frontiers, [n!(1)]);
        assert_eq!(idf.iter().collect::<Vec<_>>(), [n!(1), n!(2), n!(3)]);
    }

    #[test]
    fn multiple_definitions_ssa_example() {
        //       0 (def x)
        //       |
        //       v
        //       1
        //      / \
        //     v   v
        //     2   3 (def x)
        //     |   |
        //     v   v
        //     4   5
        //      \ /
        //       v
        //       6
        //       |
        //       v
        //       7 (def x)
        //       |
        //       v
        //       8
        //
        // Variable x is defined at nodes 0, 3, 7.
        // Where do we need phi functions?
        // DF(0) = {} (dominates everything)
        // DF(3) = {6}
        // DF(7) = {}
        // IDF({0, 3, 7}) = {6}
        let graph = TestGraph::new(&[
            (0, 1),
            (1, 2),
            (1, 3),
            (2, 4),
            (3, 5),
            (4, 6),
            (5, 6),
            (6, 7),
            (7, 8),
        ]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        // Phi function needed at node 6
        assert_eq!(
            iterated_dominance_frontier(&graph, &frontiers, [n!(0), n!(3), n!(7)])
                .iter()
                .collect::<Vec<_>>(),
            [n!(6)]
        );
    }
}
