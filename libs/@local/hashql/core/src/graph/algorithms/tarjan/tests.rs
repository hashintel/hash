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

    fn annotate_scc(&mut self, scc: SccId, root: N) -> Self::Annotation {
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

    fn annotate_scc(&mut self, scc: SccId, root: N) -> Self::Annotation {
        self.annotate_node(root)
    }

    fn merge_reachable(&mut self, lhs: &mut Self::Annotation, other: &Self::Annotation) {}

    fn merge_into_scc(&mut self, lhs: &mut Self::Annotation, other: Self::Annotation) {
        *lhs = SccBounds {
            min: cmp::min(lhs.min, other.min),
            max: cmp::max(lhs.max, other.max),
        };
    }
}

#[test]
fn diamond() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 3)]);
    let sccs: Sccs = Tarjan::new(&graph).run();

    assert_eq!(sccs.node_count(), 4);
}

#[test]
fn large_scc() {
    // The order in which things will be visited is important to this
    // test.
    //
    // We will visit:
    //
    // 0 -> 1 -> 2 -> 0
    //
    // and at this point detect a cycle. 2 will return back to 1 which
    // will visit 3. 3 will visit 2 before the cycle is complete, and
    // hence it too will return a cycle.

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

#[test]
fn three_sccs() {
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

#[test]
fn find_state_2() {
    // The order in which things will be visited is important to this
    // test. It tests part of the `find_state` behavior. Here is the
    // graph:
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
    // and at this point detect a cycle. The state of 2 will thus be
    // `InCycleWith { 1 }`. We will then visit the 1 -> 3 edge, which
    // will attempt to visit 0 as well, thus going to the state
    // `InCycleWith { 0 }`. Finally, node 1 will complete; the lowest
    // depth of any successor was 3 which had depth 0, and thus it
    // will be in the state `InCycleWith { 3 }`.
    //
    // When we finally traverse the `0 -> 4` edge and then visit node 2,
    // the states of the nodes are:
    //
    // 0 BeingVisited { 0 }
    // 1 InCycleWith { 3 }
    // 2 InCycleWith { 1 }
    // 3 InCycleWith { 0 }
    //
    // and hence 4 will traverse the links, finding an ultimate depth of 0.
    // If will also collapse the states to the following:
    //
    // 0 BeingVisited { 0 }
    // 1 InCycleWith { 3 }
    // 2 InCycleWith { 1 }
    // 3 InCycleWith { 0 }

    let sccs: Sccs = Tarjan::new(&graph).run();
    assert_eq!(sccs.node_count(), 1);
    assert_eq!(sccs.scc(n!(0)), s!(0));
    assert_eq!(sccs.scc(n!(1)), s!(0));
    assert_eq!(sccs.scc(n!(2)), s!(0));
    assert_eq!(sccs.scc(n!(3)), s!(0));
    assert_eq!(sccs.scc(n!(4)), s!(0));

    assert_successors(&sccs, s!(0), &[]);
}

#[test]
fn find_state_3() {
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

#[test]
fn deep_linear() {
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

#[test]
fn max_self_loop() {
    let graph = TestGraph::new(&[(0, 0)]);
    let metadata = MaxMetadata {
        mapping: |n: NodeId| if n.as_usize() == 0 { 17 } else { 0 },
    };

    let scc = Tarjan::new_with_metadata(&graph, metadata).run();
    assert_eq!(scc.annotation(s!(0)).0, 17);
}

#[test]
fn max_branch() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 4)]);
    let metadata = MaxMetadata {
        mapping: |n: NodeId| n.as_usize(),
    };

    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();
    assert_eq!(sccs.annotation(sccs.scc(n!(0))).0, 4);
    assert_eq!(sccs.annotation(sccs.scc(n!(1))).0, 3);
    assert_eq!(sccs.annotation(sccs.scc(n!(2))).0, 4);
}

#[test]
fn max_single_cycle() {
    let graph = TestGraph::new(&[(0, 2), (2, 3), (2, 4), (4, 1), (1, 2)]);
    let metadata = MaxMetadata {
        mapping: |n: NodeId| n.as_usize(),
    };

    let sccs = Tarjan::new_with_metadata(&graph, metadata).run();

    assert_eq!(sccs.annotation(sccs.scc(n!(2))).0, 4);
    assert_eq!(sccs.annotation(sccs.scc(n!(0))).0, 4);
}

#[test]
fn max_double_cycle() {
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

#[test]
fn minimised_bug() {
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

#[test]
fn max_minimised_leak_bug() {
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

#[test]
fn max_leak_bug() {
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
        24 => 2,
        27 => 2,
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

#[test]
fn bug_max_zero_stick_shape() {
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

#[test]
fn bounds() {
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
