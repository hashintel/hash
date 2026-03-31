use core::ops::ControlFlow;

use super::{NodeColor, TriColorDepthFirstSearch, TriColorVisitor};
use crate::{
    graph::{DirectedGraph as _, NodeId, tests::TestGraph},
    id::Id as _,
};

macro_rules! n {
    ($id:expr) => {
        NodeId::from_usize($id)
    };
}

struct CycleDetector;

impl TriColorVisitor<TestGraph> for CycleDetector {
    type Result = ControlFlow<NodeId>;

    fn node_examined(&mut self, node: NodeId, before: Option<NodeColor>) -> Self::Result {
        match before {
            Some(NodeColor::Gray) => ControlFlow::Break(node),
            _ => ControlFlow::Continue(()),
        }
    }
}

fn has_cycle(graph: &TestGraph) -> bool {
    let mut search = TriColorDepthFirstSearch::new(graph);
    (0..graph.node_count()).any(|i| search.run(n!(i), &mut CycleDetector).is_break())
}

fn cycle_target(graph: &TestGraph) -> Option<NodeId> {
    let mut search = TriColorDepthFirstSearch::new(graph);
    for i in 0..graph.node_count() {
        if let ControlFlow::Break(target) = search.run(n!(i), &mut CycleDetector) {
            return Some(target);
        }
    }
    None
}

struct PostOrderCollector {
    order: Vec<NodeId>,
}

impl TriColorVisitor<TestGraph> for PostOrderCollector {
    type Result = ControlFlow<()>;

    fn node_finished(&mut self, node: NodeId) -> Self::Result {
        self.order.push(node);
        ControlFlow::Continue(())
    }
}

fn postorder(graph: &TestGraph, root: usize) -> Vec<NodeId> {
    let mut search = TriColorDepthFirstSearch::new(graph);
    let mut collector = PostOrderCollector { order: Vec::new() };
    let _ = search.run(n!(root), &mut collector);
    collector.order
}

#[test]
fn self_loop_is_cyclic() {
    let graph = TestGraph::new(&[(0, 0)]);
    assert!(has_cycle(&graph));
    assert_eq!(cycle_target(&graph), Some(n!(0)));
}

#[test]
fn two_node_cycle() {
    let graph = TestGraph::new(&[(0, 1), (1, 0)]);
    assert!(has_cycle(&graph));
}

#[test]
fn three_node_cycle() {
    let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 0)]);
    assert!(has_cycle(&graph));
}

#[test]
fn linear_chain_no_cycle() {
    let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 3)]);
    assert!(!has_cycle(&graph));
}

#[test]
fn diamond_no_cycle() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 3)]);
    assert!(!has_cycle(&graph));
}

#[test]
fn diamond_with_back_edge_is_cyclic() {
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 3), (3, 0)]);
    assert!(has_cycle(&graph));
}

#[test]
fn disconnected_with_cycle_in_second_component() {
    // Component 1: 0 -> 1 (no cycle)
    // Component 2: 2 -> 3 -> 2 (cycle)
    let graph = TestGraph::new(&[(0, 1), (2, 3), (3, 2)]);
    assert!(has_cycle(&graph));
}

#[test]
fn disconnected_no_cycle() {
    let graph = TestGraph::new(&[(0, 1), (2, 3)]);
    assert!(!has_cycle(&graph));
}

#[test]
fn isolated_node_no_cycle() {
    // Single node, no edges (TestGraph needs at least one edge to set node_count,
    // so use two disconnected nodes with one edge).
    let graph = TestGraph::new(&[(0, 1)]);
    assert!(!has_cycle(&graph));
}

#[test]
fn postorder_linear_chain() {
    // 0 -> 1 -> 2
    let graph = TestGraph::new(&[(0, 1), (1, 2)]);
    let order = postorder(&graph, 0);
    assert_eq!(order, [n!(2), n!(1), n!(0)]);
}

#[test]
fn postorder_diamond() {
    // 0 -> 1, 0 -> 2, 1 -> 3, 2 -> 3
    let graph = TestGraph::new(&[(0, 1), (0, 2), (1, 3), (2, 3)]);
    let order = postorder(&graph, 0);

    // 3 must come before both 1 and 2; 1 and 2 must come before 0.
    assert_eq!(order.len(), 4);
    assert_eq!(*order.last().unwrap(), n!(0));

    let pos = |id: usize| order.iter().position(|&n| n == n!(id)).unwrap();
    assert!(pos(3) < pos(1));
    assert!(pos(3) < pos(2));
    assert!(pos(1) < pos(0));
    assert!(pos(2) < pos(0));
}

#[test]
fn postorder_unreachable_node_not_visited() {
    // 0 -> 1, node 2 exists but is unreachable from 0
    let graph = TestGraph::new(&[(0, 1), (2, 2)]);
    let order = postorder(&graph, 0);

    // Only nodes reachable from root 0
    assert_eq!(order, [n!(1), n!(0)]);
}

struct FilteredCycleDetector {
    ignored: (usize, usize),
}

impl TriColorVisitor<TestGraph> for FilteredCycleDetector {
    type Result = ControlFlow<()>;

    fn node_examined(&mut self, _: NodeId, before: Option<NodeColor>) -> Self::Result {
        match before {
            Some(NodeColor::Gray) => ControlFlow::Break(()),
            _ => ControlFlow::Continue(()),
        }
    }

    fn ignore_edge(&mut self, source: NodeId, target: NodeId) -> bool {
        source == n!(self.ignored.0) && target == n!(self.ignored.1)
    }
}

#[test]
fn ignore_edge_breaks_cycle() {
    // 0 -> 1 -> 2 -> 0 (cycle); ignoring 2 -> 0 removes the cycle
    let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 0)]);

    let mut search = TriColorDepthFirstSearch::new(&graph);
    let mut visitor = FilteredCycleDetector { ignored: (2, 0) };
    let result = search.run(n!(0), &mut visitor);
    assert!(result.is_continue());
}

#[test]
fn ignore_edge_wrong_edge_keeps_cycle() {
    // 0 -> 1 -> 2 -> 0 (cycle); ignoring 0 -> 1 still leaves 1 -> 2 -> 0 reachable
    // from 0? No: if 0 -> 1 is ignored, DFS from 0 has no successors, no cycle found.
    // But the cycle B -> C -> A still exists if we start from 1.
    let graph = TestGraph::new(&[(0, 1), (1, 2), (2, 0)]);

    let mut search = TriColorDepthFirstSearch::new(&graph);
    let mut visitor = FilteredCycleDetector { ignored: (0, 1) };

    // From node 0: no successors after filtering, no cycle
    assert!(search.run(n!(0), &mut visitor).is_continue());

    // From node 1: 1 -> 2 -> 0 -> (0->1 ignored) -> done, no back edge to gray
    // Wait: 0's successor 1 is ignored, so from 0 we go nowhere. But from 1: 1->2->0,
    // then 0 has no unignored successors. 0 finishes. No cycle.
    assert!(search.run(n!(1), &mut visitor).is_continue());
}

#[test]
fn run_resets_between_calls() {
    let graph = TestGraph::new(&[(0, 1), (1, 0)]);
    let mut search = TriColorDepthFirstSearch::new(&graph);

    // First run: finds cycle
    assert!(search.run(n!(0), &mut CycleDetector).is_break());

    // Second run on same search: state is reset, should find cycle again
    assert!(search.run(n!(0), &mut CycleDetector).is_break());
}

#[test]
fn run_from_accumulates_state() {
    // 0->1->2, 3->1 (node 1 reachable from both roots)
    // Without accumulation, run_from(3) would re-explore 1->2 and emit them again.
    // With accumulation, nodes 1 and 2 are already black after run_from(0).
    let graph = TestGraph::new(&[(0, 1), (1, 2), (3, 1)]);
    let mut search = TriColorDepthFirstSearch::new(&graph);
    let mut collector = PostOrderCollector { order: Vec::new() };

    search.reset();
    let _ = search.run_from(n!(0), &mut collector);
    let _ = search.run_from(n!(3), &mut collector);

    // Nodes 1 and 2 finished during first run_from; second run_from only finishes 3.
    assert_eq!(collector.order, [n!(2), n!(1), n!(0), n!(3)]);
}

#[test]
fn run_from_skips_already_finished_nodes() {
    // 0->1->2, 3->2 (shared sink at 2)
    let graph = TestGraph::new(&[(0, 1), (1, 2), (3, 2)]);
    let mut search = TriColorDepthFirstSearch::new(&graph);
    let mut collector = PostOrderCollector { order: Vec::new() };

    search.reset();
    let _ = search.run_from(n!(0), &mut collector);
    let _ = search.run_from(n!(3), &mut collector);

    // Node 2 should appear exactly once (finished during first run_from),
    // not re-emitted when reached from node 3.
    assert_eq!(collector.order.iter().filter(|&&n| n == n!(2)).count(), 1);
    assert_eq!(collector.order.len(), 4); // 2, 1, 0, 3
}
