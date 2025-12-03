use super::Dominators;
use crate::{
    graph::{DirectedGraph, Predecessors},
    id::{
        HasId as _, Id,
        bit_vec::{DenseBitSet, SparseBitMatrix},
    },
};

/// Computes the dominance frontier for each node in a control-flow graph.
///
/// The dominance frontier of a node `n` is the set of all nodes `m` where:
/// - `n` dominates a predecessor of `m`, but
/// - `n` does not strictly dominate `m`
///
/// In other words, the dominance frontier marks where `n`'s dominance "ends" — the boundary nodes
/// just beyond `n`'s dominance region.
///
/// This function implements the algorithm from Cooper, Harvey, and Kennedy's paper
/// "A Simple, Fast Dominance Algorithm" (2001), which computes dominance frontiers efficiently
/// by iterating over join points (nodes with multiple predecessors) and walking up the dominator
/// tree.
///
/// # Algorithm
///
/// The algorithm processes nodes that are either:
/// - **Join points**: nodes with ≥2 predecessors in the CFG, or
/// - **The start node**: which conceptually has an implicit entry edge from outside the graph
///
/// The start node receives special treatment because any back-edge targeting it creates a point
/// where control flow merges (the implicit entry path and the back-edge path). Without this,
/// loops back to the start node would not correctly appear in dominance frontiers.
///
/// For each such node `j`:
/// 1. For each predecessor `p` of `j`:
///    - Walk up the dominator tree from `p` toward the root
///    - Add `j` to the frontier of each node encountered
///    - Stop when reaching `idom(j)` (the immediate dominator of `j`)
///
/// # Returns
///
/// A [`DominatorFrontiers`] structure that can be queried for the dominance frontier of any node.
///
/// # Complexity
///
/// - Time: O(|E| × depth of dominator tree), where |E| is the number of edges
/// - Space: O(|V| + total frontier size), where |V| is the number of nodes
///
/// # Example
///
/// Consider a diamond-shaped CFG:
///
/// ```text
///       0
///      / \
///     1   2
///      \ /
///       3
/// ```
///
/// - Nodes 1 and 2 are dominated by 0
/// - Node 3 is a join point (has predecessors 1 and 2)
/// - The dominance frontier of nodes 1 and 2 is {3}
/// - The dominance frontier of node 0 is empty (it dominates everything)
/// - The dominance frontier of node 3 is empty (no successors)
pub fn dominance_frontiers<G: DirectedGraph + Predecessors>(
    graph: &G,
    start_id: G::NodeId,
    dominators: &Dominators<G::NodeId>,
) -> DominatorFrontiers<G::NodeId> {
    let mut frontiers = SparseBitMatrix::new(graph.node_count());

    for node in graph.iter_nodes() {
        let node_id = node.id();
        let mut predecessors = graph.predecessors(node_id);

        let is_start = node_id == start_id;

        let mut prefix = None;
        if !is_start {
            // Only if the node has multiple predecessors it's going to be a join point, otherwise
            // we skip this specific node.
            let Ok([first, second]) = predecessors.next_chunk() else {
                // There are less than 2 predecessors, which means that is naturally not a join
                // point
                continue;
            };

            prefix = Some([first, second]);
        }

        let predecessors = prefix.into_iter().flatten().chain(predecessors);

        for predecessor in predecessors {
            let mut runner = predecessor;

            // Walk up the dominator tree until we reach the immediate dominator of node
            let idom_node = dominators.immediate_dominator(node_id);

            while Some(runner) != idom_node {
                frontiers.insert(runner, node_id);

                // Move up the dominator tree (if possible)
                let Some(idom_runner) = dominators.immediate_dominator(runner) else {
                    // We've reached the root and therefore finished computation
                    break;
                };

                runner = idom_runner;
            }
        }
    }

    DominatorFrontiers { frontiers }
}

/// Pre-computed dominance frontiers for all nodes in a control-flow graph.
///
/// Created by [`dominance_frontiers`] and provides efficient lookup of the dominance frontier
/// for any node via the [`frontier`] method.
///
/// [`frontier`]: Self::frontier
pub struct DominatorFrontiers<N> {
    frontiers: SparseBitMatrix<N, N>,
}

impl<N> DominatorFrontiers<N>
where
    N: Id,
{
    /// Returns the dominance frontier of the given node.
    ///
    /// The returned [`DominanceFrontier`] provides methods to iterate over frontier nodes,
    /// check containment, and query emptiness.
    pub fn frontier(&self, node: N) -> DominanceFrontier<'_, N> {
        DominanceFrontier {
            inner: self.frontiers.row(node),
        }
    }
}

/// The dominance frontier of a single node.
///
/// This is a view into the frontier data, providing iteration and query methods.
pub struct DominanceFrontier<'a, N> {
    inner: Option<&'a DenseBitSet<N>>,
}

impl<N> DominanceFrontier<'_, N>
where
    N: Id,
{
    /// Returns `true` if the dominance frontier is empty.
    pub fn is_empty(&self) -> bool {
        self.inner.is_none_or(DenseBitSet::is_empty)
    }

    /// Returns the number of nodes in this dominance frontier.
    pub fn count(&self) -> usize {
        self.inner.map_or(0, DenseBitSet::count)
    }

    /// Returns `true` if `frontier_node` is in this dominance frontier.
    ///
    /// This indicates that the node's dominance "ends" at `frontier_node`.
    pub fn contains(&self, frontier_node: N) -> bool {
        self.inner.is_some_and(|set| set.contains(frontier_node))
    }

    /// Returns an iterator over the nodes in this dominance frontier.
    pub fn iter(&self) -> impl Iterator<Item = N> {
        self.into_iter()
    }

    /// Returns the underlying [`DenseBitSet`] if the frontier is non-empty.
    #[must_use]
    pub const fn as_inner(&self) -> Option<&DenseBitSet<N>> {
        self.inner
    }
}

impl<N> IntoIterator for &DominanceFrontier<'_, N>
where
    N: Id,
{
    type Item = N;

    type IntoIter = impl Iterator<Item = N>;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.into_iter().flatten()
    }
}

impl<N> IntoIterator for DominanceFrontier<'_, N>
where
    N: Id,
{
    type Item = N;

    type IntoIter = impl Iterator<Item = N>;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.into_iter().flatten()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{NodeId, algorithms::dominators::dominators, tests::TestGraph};

    macro_rules! n {
        ($expr:expr) => {
            NodeId::new($expr)
        };
    }

    #[test]
    fn path_graph() {
        // 0 --> 1 --> 2 --> 3 --> 4
        //
        // No join points, all frontiers empty.
        let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 3), (3, 4)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        for i in 0..5 {
            assert!(
                frontiers.frontier(n!(i)).is_empty(),
                "DF({i}) should be empty"
            );
        }
    }

    #[test]
    fn cycle_graph() {
        // +---- 4 <-- 3
        // |           ^
        // v           |
        // 0 --> 1 --> 2
        //
        // Back-edge 4->0 makes 0 a join point (start node with predecessor).
        // All nodes have {0} in their frontier since every path eventually
        // reaches 0 where dominance merges.
        let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 3), (3, 4), (4, 0)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        for i in 0..5 {
            assert_eq!(
                frontiers.frontier(n!(i)).iter().collect::<Vec<_>>(),
                [n!(0)],
                "DF({i}) should be {{0}}"
            );
        }
    }

    #[test]
    fn irreducible1() {
        //       0
        //      / \
        //     v   v
        //     3   4
        //     |   |
        //     v   v
        //     2<--1
        //     |   ^
        //     +---+
        //
        // Irreducible CFG from Cooper-Harvey-Kennedy paper (figure 2).
        // Nodes 1 and 2 form a strongly connected component with no single entry.
        let graph = TestGraph::new(&[(0, 3), (0, 4), (3, 2), (4, 1), (1, 2), (2, 1)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert!(frontiers.frontier(n!(0)).is_empty());
        assert_eq!(
            frontiers.frontier(n!(1)).iter().collect::<Vec<_>>(),
            [n!(2)]
        );
        assert_eq!(
            frontiers.frontier(n!(2)).iter().collect::<Vec<_>>(),
            [n!(1)]
        );
        assert_eq!(
            frontiers.frontier(n!(3)).iter().collect::<Vec<_>>(),
            [n!(2)]
        );
        assert_eq!(
            frontiers.frontier(n!(4)).iter().collect::<Vec<_>>(),
            [n!(1)]
        );
    }

    #[test]
    fn irreducible2() {
        //         0
        //        / \
        //       v   v
        //       1   2
        //       |  / \
        //       | v   v
        //       | 3<->4
        //       |     ^
        //       v     |
        //       5<----+
        //       |
        //       +---->4 (back-edge)
        //
        // Two mutually recursive loops: 3<->4 and 4<->5.
        // Irreducible CFG from Cooper-Harvey-Kennedy paper (figure 4).
        let graph = TestGraph::new(&[
            (0, 1),
            (0, 2),
            (1, 5),
            (2, 3),
            (2, 4),
            (3, 4),
            (4, 3),
            (4, 5),
            (5, 4),
        ]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert!(frontiers.frontier(n!(0)).is_empty());
        assert_eq!(
            frontiers.frontier(n!(1)).iter().collect::<Vec<_>>(),
            [n!(5)]
        );
        assert_eq!(
            frontiers.frontier(n!(2)).iter().collect::<Vec<_>>(),
            [n!(3), n!(4)]
        );
        assert_eq!(
            frontiers.frontier(n!(3)).iter().collect::<Vec<_>>(),
            [n!(4)]
        );
        assert_eq!(
            frontiers.frontier(n!(4)).iter().collect::<Vec<_>>(),
            [n!(3), n!(5)]
        );
        assert_eq!(
            frontiers.frontier(n!(5)).iter().collect::<Vec<_>>(),
            [n!(4)]
        );
    }

    #[test]
    fn diamond_with_loop() {
        //       0
        //       |
        //       v
        // +---->1<----+
        // |    /|\    |
        // |   v v v   |
        // |   2 3 5   |
        // |   |  \    |
        // |   v   v   |
        // |   4<--+   |
        // |   |       |
        // +---+-------+
        //
        // Diamond pattern with back-edge 4->1 creating a loop.
        let graph = TestGraph::new(&[(0, 1), (1, 2), (1, 3), (1, 5), (2, 4), (3, 4), (4, 1)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert!(frontiers.frontier(n!(0)).is_empty());
        assert_eq!(
            frontiers.frontier(n!(1)).iter().collect::<Vec<_>>(),
            [n!(1)]
        );
        assert_eq!(
            frontiers.frontier(n!(2)).iter().collect::<Vec<_>>(),
            [n!(4)]
        );
        assert_eq!(
            frontiers.frontier(n!(3)).iter().collect::<Vec<_>>(),
            [n!(4)]
        );
        assert_eq!(
            frontiers.frontier(n!(4)).iter().collect::<Vec<_>>(),
            [n!(1)]
        );
        assert!(frontiers.frontier(n!(5)).is_empty());
    }

    #[test]
    fn branching_to_exit() {
        //       0
        //      / \
        //     v   v
        //     1   3
        //     |   |
        //     v   v
        //     2   4<--+
        //     |  / \  |
        //     | v   v |
        //     | 5   6-+
        //     | |
        //     v v
        //     7<+
        //
        // Multiple branches converging at exit node 7.
        let graph = TestGraph::new(&[
            (0, 1),
            (1, 2),
            (1, 3),
            (2, 7),
            (3, 4),
            (4, 5),
            (4, 6),
            (5, 7),
            (6, 4),
        ]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert!(frontiers.frontier(n!(0)).is_empty());
        assert!(frontiers.frontier(n!(1)).is_empty());
        assert_eq!(
            frontiers.frontier(n!(2)).iter().collect::<Vec<_>>(),
            [n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(3)).iter().collect::<Vec<_>>(),
            [n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(4)).iter().collect::<Vec<_>>(),
            [n!(4), n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(5)).iter().collect::<Vec<_>>(),
            [n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(6)).iter().collect::<Vec<_>>(),
            [n!(4)]
        );
        assert!(frontiers.frontier(n!(7)).is_empty());
    }

    #[test]
    fn simple_loop() {
        //       +---+
        //       v   |
        // 0 --> 1 --+
        //       |
        //       v
        //       2
        //
        // Simple loop with back-edge 1->0.
        let graph = TestGraph::new(&[(0, 1), (1, 2), (1, 0)]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert_eq!(
            frontiers.frontier(n!(0)).iter().collect::<Vec<_>>(),
            [n!(0)]
        );
        assert_eq!(
            frontiers.frontier(n!(1)).iter().collect::<Vec<_>>(),
            [n!(0)]
        );
        assert!(frontiers.frontier(n!(2)).is_empty());
    }

    #[test]
    fn nested_loops() {
        //        0
        //       / \
        //      v   v
        //      1   7
        //      |   ^
        //      v   |
        // +--->2---+----+
        // |    |        |
        // |    v        |
        // | +->3<----+  |
        // | |  |     |  |
        // | |  v     |  |
        // | |  4<+   |  |
        // | |  | |   |  |
        // | |  v |   |  |
        // | |  5-+---+  |
        // | |  |        |
        // | |  v        |
        // | +--6--------+
        // +----+
        //
        // Complex nested loop structure with self-loop on node 4.
        let graph = TestGraph::new(&[
            (0, 1),
            (0, 7),
            (1, 2),
            (2, 3),
            (3, 4),
            (4, 4),
            (4, 5),
            (5, 3),
            (5, 6),
            (6, 2),
            (6, 7),
        ]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert!(frontiers.frontier(n!(0)).is_empty());
        assert_eq!(
            frontiers.frontier(n!(1)).iter().collect::<Vec<_>>(),
            [n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(2)).iter().collect::<Vec<_>>(),
            [n!(2), n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(3)).iter().collect::<Vec<_>>(),
            [n!(2), n!(3), n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(4)).iter().collect::<Vec<_>>(),
            [n!(2), n!(3), n!(4), n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(5)).iter().collect::<Vec<_>>(),
            [n!(2), n!(3), n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(6)).iter().collect::<Vec<_>>(),
            [n!(2), n!(7)]
        );
        assert!(frontiers.frontier(n!(7)).is_empty());
    }

    #[test]
    fn complex_cfg() {
        //        0
        //        |
        //        v
        // +----->1<---------+
        // |     / \         |
        // |    v   v        |
        // |    2   5        |
        // |    |  / \       |
        // |    v v   v      |
        // |    3<----7<--8  |
        // |    |     |      |
        // |    +-----+------+
        // |    |
        // +----+
        //      |
        //      v
        //      4
        //
        // Complex CFG with multiple join points and back-edges.
        let graph = TestGraph::new(&[
            (0, 1),
            (1, 2),
            (1, 5),
            (2, 3),
            (3, 1),
            (3, 4),
            (5, 6),
            (5, 8),
            (6, 7),
            (7, 3),
            (8, 7),
        ]);
        let doms = dominators(&graph, n!(0));
        let frontiers = dominance_frontiers(&graph, n!(0), &doms);

        assert!(frontiers.frontier(n!(0)).is_empty());
        assert_eq!(
            frontiers.frontier(n!(1)).iter().collect::<Vec<_>>(),
            [n!(1)]
        );
        assert_eq!(
            frontiers.frontier(n!(2)).iter().collect::<Vec<_>>(),
            [n!(3)]
        );
        assert_eq!(
            frontiers.frontier(n!(3)).iter().collect::<Vec<_>>(),
            [n!(1)]
        );
        assert!(frontiers.frontier(n!(4)).is_empty());
        assert_eq!(
            frontiers.frontier(n!(5)).iter().collect::<Vec<_>>(),
            [n!(3)]
        );
        assert_eq!(
            frontiers.frontier(n!(6)).iter().collect::<Vec<_>>(),
            [n!(7)]
        );
        assert_eq!(
            frontiers.frontier(n!(7)).iter().collect::<Vec<_>>(),
            [n!(3)]
        );
        assert_eq!(
            frontiers.frontier(n!(8)).iter().collect::<Vec<_>>(),
            [n!(7)]
        );
    }
}
