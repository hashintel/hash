//! This file is derived from the Rust compiler source code.
//! Source: <https://github.com/rust-lang/rust/blob/e22dab387f6b4f6a87dfc54ac2f6013dddb41e68/compiler/rustc_data_structures/src/graph/scc/tests.rs>
//!
//! Originally dual-licensed under either of:
//!   - Apache License, Version 2.0 (see LICENSE-APACHE.md or <https://www.apache.org/licenses/LICENSE-2.0>)
//!   - MIT license (see LICENSE-MIT.md or <https://opensource.org/licenses/MIT>)
//!
//! You may use, copy, modify, and distribute this file under the terms of the
//! GNU Affero General Public License, Version 3.0, as part of this project,
//! provided that all original notices are preserved.
use core::cmp;

use super::{Metadata, StronglyConnectedComponents};
use crate::{
    graph::{
        DirectedGraph as _, NodeId, Successors as _, algorithms::tarjan::Tarjan, tests::TestGraph,
    },
    id::Id as _,
    newtype,
};

newtype!(struct SccId(usize is 0..=usize::MAX));

type Sccs<M = ()> = StronglyConnectedComponents<NodeId, SccId, M>;

macro_rules! n {
    ($id:expr) => {
        NodeId::from_usize($id)
    };
}

#[expect(clippy::min_ident_chars, reason = "internal macro")]
macro_rules! s {
    ($id:expr) => {
        SccId::from_usize($id)
    };
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct ReachableMaximum(usize);

struct MaxMetadata<N> {
    mapping: fn(N) -> usize,
}

impl<N> Metadata<N, SccId> for MaxMetadata<N> {
    type Annotation = ReachableMaximum;

    fn annotate_node(&mut self, node: N) -> Self::Annotation {
        ReachableMaximum((self.mapping)(node))
    }

    fn annotate_scc(&mut self, _: SccId, root: N) -> Self::Annotation {
        self.annotate_node(root)
    }

    fn merge_reachable(&mut self, lhs: &mut Self::Annotation, other: &Self::Annotation) {
        *lhs = cmp::max(*lhs, *other);
    }

    fn merge_into_scc(&mut self, lhs: &mut Self::Annotation, other: Self::Annotation) {
        *lhs = cmp::max(*lhs, other);
    }
}

impl<N> MaxMetadata<N> {
    fn new(mapping: fn(N) -> usize) -> Self {
        Self { mapping }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct SccBounds {
    min: usize,
    max: usize,
}

struct SccBoundsMetadata<N> {
    mapping: fn(N) -> SccBounds,
}

impl<N> Metadata<N, SccId> for SccBoundsMetadata<N> {
    type Annotation = SccBounds;

    fn annotate_node(&mut self, node: N) -> Self::Annotation {
        (self.mapping)(node)
    }

    fn annotate_scc(&mut self, _: SccId, root: N) -> Self::Annotation {
        self.annotate_node(root)
    }

    fn merge_reachable(&mut self, _: &mut Self::Annotation, _: &Self::Annotation) {}

    fn merge_into_scc(&mut self, lhs: &mut Self::Annotation, other: Self::Annotation) {
        *lhs = SccBounds {
            min: cmp::min(lhs.min, other.min),
            max: cmp::max(lhs.max, other.max),
        };
    }
}

/// Tests SCC detection on a simple diamond-shaped DAG.
/// Each node forms its own SCC since there are no cycles.
#[test]
fn simple_dag() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 3)]);
    let sccs: Sccs = Tarjan::new(&graph).run();

    assert_eq!(sccs.node_count(), 4);
}

/// Tests that all nodes in a strongly connected graph are identified as a single SCC.
/// Verifies the algorithm handles cycles that branch and rejoin.
#[test]
fn single_scc_with_multiple_nodes() {
    /*
    +-> 0
    |   |
    |   v
    |   1 -> 3
    |   |    |
    |   v    |
    +-- 2 <--+
         */
    let graph = TestGraph::new(&[(0, 1), (1, 2), (1, 3), (2, 0), (3, 2)]);
    let sccs: Sccs = Tarjan::new(&graph).run();

    assert_eq!(sccs.node_count(), 1);
}

#[track_caller]
fn assert_successors(sccs: &Sccs, scc: SccId, successors: &[SccId]) {
    assert_eq!(sccs.successors(scc).collect::<Vec<_>>(), successors);
}

/// Tests a graph with multiple SCCs where some SCCs depend on others.
/// Verifies correct SCC identification and successor relationships in the condensation graph.
#[test]
fn multiple_sccs_with_dependencies() {
    /*
        0
        |
        v
    +-> 1    3
    |   |    |
    |   v    |
    +-- 2 <--+
         */
    let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 1), (3, 2)]);
    let sccs: Sccs = Tarjan::new(&graph).run();

    assert_eq!(sccs.node_count(), 3);
    assert_eq!(sccs.scc(n!(0)), s!(1));
    assert_eq!(sccs.scc(n!(1)), s!(0));
    assert_eq!(sccs.scc(n!(2)), s!(0));
    assert_eq!(sccs.scc(n!(3)), s!(2));

    assert_successors(&sccs, s!(0), &[]);
    assert_successors(&sccs, s!(1), &[s!(0)]);
    assert_successors(&sccs, s!(2), &[s!(0)]);
}

/// Tests a complex graph with nested cycles and multiple entry points.
/// Verifies the algorithm correctly identifies all nodes as part of a single strongly connected
/// component.
#[test]
fn complex_nested_cycle() {
    // The order in which things will be visited is important to this
    // test. Here is the graph:
    //
    //
    //       /----+
    //     0 <--+ |
    //     |    | |
    //     v    | |
    // +-> 1 -> 3 4
    // |   |      |
    // |   v      |
    // +-- 2 <----+

    let graph = TestGraph::new(&[(0, 1), (0, 4), (1, 2), (1, 3), (2, 1), (3, 0), (4, 2)]);

    // For this graph, we will start in our DFS by visiting:
    //
    // 0 -> 1 -> 2 -> 1
    //
    // and at this point detect a cycle.

    let sccs: Sccs = Tarjan::new(&graph).run();
    assert_eq!(sccs.node_count(), 1);
    assert_eq!(sccs.scc(n!(0)), s!(0));
    assert_eq!(sccs.scc(n!(1)), s!(0));
    assert_eq!(sccs.scc(n!(2)), s!(0));
    assert_eq!(sccs.scc(n!(3)), s!(0));
    assert_eq!(sccs.scc(n!(4)), s!(0));

    assert_successors(&sccs, s!(0), &[]);
}

/// Tests a graph where multiple nodes point into a single large SCC.
/// Verifies the algorithm correctly separates the external node into its own SCC.
#[test]
fn two_sccs_with_shared_predecessor() {
    /*
          /----+
        0 <--+ |
        |    | |
        v    | |
    +-> 1 -> 3 4 5
    |   |      | |
    |   v      | |
    +-- 2 <----+-+
         */
    let graph = TestGraph::new(&[
        (0, 1),
        (0, 4),
        (1, 2),
        (1, 3),
        (2, 1),
        (3, 0),
        (4, 2),
        (5, 2),
    ]);
    let sccs: Sccs = Tarjan::new(&graph).run();

    assert_eq!(sccs.node_count(), 2);
    assert_eq!(sccs.scc(n!(0)), s!(0));
    assert_eq!(sccs.scc(n!(1)), s!(0));
    assert_eq!(sccs.scc(n!(2)), s!(0));
    assert_eq!(sccs.scc(n!(3)), s!(0));
    assert_eq!(sccs.scc(n!(4)), s!(0));
    assert_eq!(sccs.scc(n!(5)), s!(1));

    assert_successors(&sccs, s!(0), &[]);
    assert_successors(&sccs, s!(1), &[s!(0)]);
}

/// Tests the algorithm on a deep linear chain to ensure stack-based iteration handles depth
/// correctly. Each node should form its own SCC in a linear dependency chain.
#[test]
fn deep_linear_chain() {
    /*
    0
    |
    v
    1
    |
    v
    2
    |
    v
    …
     */
    const NODE_COUNT: usize = 1 << 14;

    let mut nodes = vec![];
    for i in 1..NODE_COUNT {
        nodes.push((i - 1, i));
    }

    let graph = TestGraph::new(nodes.as_slice());
    let sccs: Sccs = Tarjan::new(&graph).run();

    assert_eq!(sccs.node_count(), NODE_COUNT);
    assert_eq!(sccs.scc(n!(0)), s!(NODE_COUNT - 1));
    assert_eq!(sccs.scc(n!(NODE_COUNT - 1)), s!(0));
}

/// Tests that metadata is correctly computed and merged for a single-node SCC with a self-loop.
#[test]
fn metadata_self_loop() {
    let graph = TestGraph::new(&[(0, 0)]);
    let metadata = MaxMetadata {
        mapping: |n: NodeId| if n.as_usize() == 0 { 17 } else { 0 },
    };

    let scc = Tarjan::new_with_metadata(&graph, metadata).run();
    assert_eq!(scc.annotation(s!(0)).0, 17);
}

/// Tests that metadata propagates correctly through a DAG via `merge_reachable`.
/// Each SCC should accumulate the maximum value reachable from its successors.
#[test]
fn metadata_dag_propagation() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 4)]);
    let metadata = MaxMetadata {
        mapping: |n: NodeId| n.as_usize(),
    };

    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();
    assert_eq!(sccs.annotation(sccs.scc(n!(0))).0, 4);
    assert_eq!(sccs.annotation(sccs.scc(n!(1))).0, 3);
    assert_eq!(sccs.annotation(sccs.scc(n!(2))).0, 4);
}

/// Tests that metadata merges correctly within a single SCC and propagates to predecessors.
#[test]
fn metadata_single_cycle() {
    let graph = TestGraph::new(&[(0, 2), (2, 3), (2, 4), (4, 1), (1, 2)]);
    let metadata = MaxMetadata {
        mapping: |n: NodeId| n.as_usize(),
    };

    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();

    assert_eq!(sccs.annotation(sccs.scc(n!(2))).0, 4);
    assert_eq!(sccs.annotation(sccs.scc(n!(0))).0, 4);
}

/// Tests metadata propagation through multiple nested SCCs.
/// Verifies that values propagate correctly from inner SCCs to outer SCCs.
#[test]
fn metadata_nested_cycles() {
    let graph = TestGraph::new(&[
        (0, 1),
        (1, 2),
        (1, 4),
        (2, 3),
        (2, 4),
        (3, 5),
        (4, 1),
        (5, 4),
    ]);
    let metadata = MaxMetadata {
        mapping: |n: NodeId| if n.as_usize() == 5 { 2 } else { 1 },
    };

    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();

    assert_eq!(sccs.annotation(sccs.scc(n!(0))).0, 2);
}

/// Tests that metadata from disjoint SCCs remains isolated and doesn't leak between unconnected
/// components.
#[test]
fn metadata_isolation() {
    let graph = TestGraph::new(&[(0, 3), (0, 1), (3, 2), (2, 3), (1, 4), (4, 5), (5, 4)]);
    let metadata = MaxMetadata {
        mapping: |n: NodeId| match n.as_usize() {
            3 => 1,
            _ => 0,
        },
    };

    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();
    assert_eq!(sccs.annotation(sccs.scc(n!(2))).0, 1);
    assert_eq!(sccs.annotation(sccs.scc(n!(1))).0, 0);
    assert_eq!(sccs.annotation(sccs.scc(n!(4))).0, 0);
}

/// Tests metadata propagation from an SCC back to a predecessor SCC that forms a larger cycle.
#[test]
fn metadata_propagation_through_cycle() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (3, 0), (3, 4), (4, 3)]);
    let metadata = MaxMetadata {
        mapping: |w: NodeId| match w.as_usize() {
            4 => 1,
            _ => 0,
        },
    };

    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();

    assert_eq!(sccs.annotation(sccs.scc(n!(2))).0, 0);
    assert_eq!(sccs.annotation(sccs.scc(n!(3))).0, 1);
    assert_eq!(sccs.annotation(sccs.scc(n!(0))).0, 1);
}

/// Tests metadata computation on a complex graph with multiple SCCs and intricate dependency
/// relationships.
#[test]
fn metadata_complex_graph() {
    let graph = TestGraph::new(&[
        (0, 0),
        (0, 18),
        (0, 19),
        (0, 1),
        (0, 2),
        (0, 7),
        (0, 8),
        (0, 23),
        (18, 0),
        (18, 12),
        (19, 0),
        (19, 25),
        (12, 18),
        (12, 3),
        (12, 5),
        (3, 12),
        (3, 21),
        (3, 22),
        (5, 13),
        (21, 3),
        (22, 3),
        (13, 5),
        (13, 4),
        (4, 13),
        (4, 0),
        (2, 11),
        (7, 6),
        (6, 20),
        (20, 6),
        (8, 17),
        (17, 9),
        (9, 16),
        (16, 26),
        (26, 15),
        (15, 10),
        (10, 14),
        (14, 27),
        (23, 24),
    ]);
    let metadata = MaxMetadata::new(|w: NodeId| match w.as_usize() {
        22 => 1,
        24 | 27 => 2,
        _ => 0,
    });
    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();

    assert_eq!(sccs.annotation(sccs.scc(n!(2))).0, 0);
    assert_eq!(sccs.annotation(sccs.scc(n!(7))).0, 0);
    assert_eq!(sccs.annotation(sccs.scc(n!(8))).0, 2);
    assert_eq!(sccs.annotation(sccs.scc(n!(23))).0, 2);
    assert_eq!(sccs.annotation(sccs.scc(n!(3))).0, 2);
    assert_eq!(sccs.annotation(sccs.scc(n!(0))).0, 2);
}

/// Tests metadata propagation through a linear chain that terminates in a cycle.
#[test]
fn metadata_chain_with_cycle() {
    let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 3), (3, 2), (3, 4)]);
    let metadata = MaxMetadata::new(|w: NodeId| match w.as_usize() {
        4 => 1,
        _ => 0,
    });
    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();

    assert_eq!(sccs.annotation(sccs.scc(n!(0))).0, 1);
    assert_eq!(sccs.annotation(sccs.scc(n!(1))).0, 1);
    assert_eq!(sccs.annotation(sccs.scc(n!(2))).0, 1);
    assert_eq!(sccs.annotation(sccs.scc(n!(3))).0, 1);
    assert_eq!(sccs.annotation(sccs.scc(n!(4))).0, 1);
}

/// Tests that `merge_into_scc` correctly combines metadata from all nodes within an SCC.
/// Uses min/max bounds to verify both merge operations work correctly.
#[test]
fn metadata_merge_within_scc() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (3, 0), (3, 4), (4, 3), (3, 5)]);
    let metadata = SccBoundsMetadata {
        mapping: |w: NodeId| SccBounds {
            min: w.as_usize(),
            max: w.as_usize(),
        },
    };
    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();

    assert_eq!(sccs.annotation(sccs.scc(n!(2))).min, 2);
    assert_eq!(sccs.annotation(sccs.scc(n!(2))).max, 2);
    assert_eq!(sccs.annotation(sccs.scc(n!(0))).min, 0);
    assert_eq!(sccs.annotation(sccs.scc(n!(0))).max, 4);
    assert_eq!(sccs.annotation(sccs.scc(n!(3))).min, 0);
    assert_eq!(sccs.annotation(sccs.scc(n!(3))).max, 4);
    assert_eq!(sccs.annotation(sccs.scc(n!(5))).min, 5);
}
