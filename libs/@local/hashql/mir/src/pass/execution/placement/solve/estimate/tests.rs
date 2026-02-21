#![expect(clippy::min_ident_chars)]

use hashql_core::{heap::Heap, id::IdArray, r#type::environment::Environment};

use super::{
    super::{
        PlacementSolverContext,
        tests::{bb, find_region_of, stmt_costs, target_set, terminators},
    },
    *,
};
use crate::{
    body::{basic_block::BasicBlockSlice, location::Location},
    builder::body,
    intern::Interner,
    pass::execution::{
        StatementCostVec,
        target::{TargetArray, TargetId},
        terminator_placement::{TerminatorCostVec, TransMatrix},
    },
};

const I: TargetId = TargetId::Interpreter;
const P: TargetId = TargetId::Postgres;
const E: TargetId = TargetId::Embedding;

/// Verifies that pop returns elements in ascending cost order.
///
/// Elements inserted in arbitrary order must be retrieved cheapest-first,
/// since every value-ordering decision in the solver depends on this invariant.
#[test]
fn heap_insert_maintains_sorted_order() {
    let mut heap = TargetHeap::new();
    heap.insert(P, cost!(30).as_approx());
    heap.insert(I, cost!(10).as_approx());
    heap.insert(E, cost!(20).as_approx());

    let first = heap.pop().expect("heap is non-empty");
    assert_eq!(first.target, I);
    assert_eq!(first.cost, cost!(10).as_approx());

    let second = heap.pop().expect("heap is non-empty");
    assert_eq!(second.target, E);
    assert_eq!(second.cost, cost!(20).as_approx());

    let third = heap.pop().expect("heap is non-empty");
    assert_eq!(third.target, P);
    assert_eq!(third.cost, cost!(30).as_approx());
}

/// Verifies that popping beyond the heap's contents returns `None`.
///
/// After all elements are consumed, `pop()` must return `None` and both
/// `is_empty()` and `len()` must reflect the empty state.
#[test]
fn heap_pop_exhaustion() {
    let mut heap = TargetHeap::new();
    heap.insert(I, cost!(5).as_approx());
    heap.insert(P, cost!(10).as_approx());

    let first = heap.pop().expect("heap is non-empty");
    assert_eq!(first.target, I);
    assert_eq!(first.cost, cost!(5).as_approx());

    let second = heap.pop().expect("heap is non-empty");
    assert_eq!(second.target, P);
    assert_eq!(second.cost, cost!(10).as_approx());

    assert!(heap.pop().is_none());
    assert!(heap.is_empty());
    assert_eq!(heap.len(), 0);
}

/// Verifies that `peek()` returns the minimum element without advancing the internal index.
///
/// Repeated peeks must return the same element, and a subsequent `pop()` must
/// still yield that element. The heap length must not change until `pop()`.
#[test]
fn heap_peek_does_not_consume() {
    let mut heap = TargetHeap::new();
    heap.insert(I, cost!(7).as_approx());

    assert_eq!(heap.len(), 1);

    let peeked = heap.peek().expect("peeking at non-empty heap");
    assert_eq!(peeked.target, I);
    assert_eq!(peeked.cost, cost!(7).as_approx());

    let peeked_again = heap.peek().expect("peeking at non-empty heap");
    assert_eq!(peeked_again.target, I);
    assert_eq!(peeked_again.cost, cost!(7).as_approx());

    let popped = heap.pop().expect("heap is non-empty");
    assert_eq!(popped.target, I);
    assert_eq!(popped.cost, cost!(7).as_approx());

    assert_eq!(heap.len(), 0);
    assert!(heap.peek().is_none());
}

/// Verifies that elements with equal costs are both retained and returned.
///
/// Tie-breaking order between equal-cost elements is unspecified, but both
/// must be present in the output.
#[test]
fn heap_equal_cost_elements() {
    let mut heap = TargetHeap::new();
    heap.insert(I, cost!(5).as_approx());
    heap.insert(P, cost!(5).as_approx());

    let first = heap.pop().expect("heap is non-empty");
    let second = heap.pop().expect("heap is non-empty");

    assert_eq!(first.cost, cost!(5).as_approx());
    assert_eq!(second.cost, cost!(5).as_approx());

    let mut targets = [first.target, second.target];
    targets.sort();
    let mut expected = [I, P];
    expected.sort();
    assert_eq!(targets, expected);
}

// --- CostEstimation tests ---

/// Verifies that self-loop edges do not contribute to cost estimation.
///
/// A block's self-loop always transitions to itself (cost 0), so the estimator
/// must skip edges where `pred == block` or `succ == block`. An expensive
/// cross-target transition on the self-loop arm must not inflate the cost.
#[test]
fn self_loop_edges_excluded_from_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0: self-loop via `if cond then bb0() else bb1()`, bb1: return
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

        bb0() {
            cond = load true;
            if cond then bb0() else bb1();
        },
        bb1() {
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, target_set(&[I])];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements; bb(0): I = 5, P = 5 }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            I->I = 0, P->I = 0;
            diagonal(0), I->P = 100, P->I = 100
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let solver = data.build_in(&body, &heap);
    solver.targets[bb(1)] = Some(HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    });

    let region_id = find_region_of(&solver, bb(0));

    let cost = CostEstimation {
        config: CostEstimationConfig::TRIVIAL,
        solver: &solver,
        determine_target: |block| solver.targets[block],
    }
    .estimate(&body, region_id, bb(0), I);

    // stmt(5) + exit edge I→I(0) = 5. Self-loop I→P=100 must NOT contribute.
    assert_eq!(cost, Some(cost!(5).as_approx()));
}

/// Verifies that the boundary multiplier scales cross-region transition costs.
///
/// With `TRIVIAL` (multiplier 1.0) the full transition cost applies, while
/// `LOOP` (multiplier 0.5) halves it. This allows the backward pass to
/// discount boundary edges inside cyclic regions.
#[test]
fn boundary_multiplier_applied_to_cross_region_edges() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 → bb1 → bb2, three trivial SCCs
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            x = load 0;
            goto bb2();
        },
        bb2() {
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, ip];

    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0), I->P = 20, P->I = 0];
        bb(1): [diagonal(0), I->P = 0, P->I = 20]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let solver = data.build_in(&body, &heap);
    solver.targets[bb(0)] = Some(HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    });
    solver.targets[bb(2)] = Some(HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    });

    let region_id = find_region_of(&solver, bb(1));

    // With TRIVIAL (multiplier 1.0): stmt(0) + I→P(20) + P→I(20) = 40
    let trivial_cost = CostEstimation {
        config: CostEstimationConfig::TRIVIAL,
        solver: &solver,
        determine_target: |block| solver.targets[block],
    }
    .estimate(&body, region_id, bb(1), P);

    assert_eq!(trivial_cost, Some(cost!(40).as_approx()));

    // With LOOP (multiplier 0.5): stmt(0) + 10 + 10 = 20
    let loop_cost = CostEstimation {
        config: CostEstimationConfig::LOOP,
        solver: &solver,
        determine_target: |block| solver.targets[block],
    }
    .estimate(&body, region_id, bb(1), P);

    assert_eq!(loop_cost, Some(cost!(20).as_approx()));
}

/// Verifies that estimation returns `None` when no valid transition exists.
///
/// If a neighbor is fixed at a target with no matrix entry leading to the
/// candidate target, the transition is infeasible and the estimate must
/// return `None` to signal domain pruning.
#[test]
fn infeasible_transition_returns_none() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 → bb1, two trivial SCCs
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            return x;
        }
    });

    let domains = [target_set(&[P]), target_set(&[I, P])];

    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [I->I = 0]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let solver = data.build_in(&body, &heap);
    solver.targets[bb(0)] = Some(HeapElement {
        target: P,
        cost: ApproxCost::ZERO,
    });

    let region_id = find_region_of(&solver, bb(1));

    // P is fixed for bb0, but no P→I transition exists → None
    let cost = CostEstimation {
        config: CostEstimationConfig::TRIVIAL,
        solver: &solver,
        determine_target: |block| solver.targets[block],
    }
    .estimate(&body, region_id, bb(1), I);

    assert_eq!(cost, None);
}

/// Verifies that unassigned neighbors use the heuristic minimum over their domain.
///
/// When a neighbor has no committed target, the estimator picks the cheapest
/// `(statement_cost + transition_cost)` combination across the neighbor's
/// domain to produce an optimistic lower bound.
#[test]
fn unassigned_neighbor_uses_heuristic_minimum() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 → bb1, two trivial SCCs
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            x = load 0;
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(0): I = 3, P = 7;
        bb(1): I = 3, P = 7
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0), I->P = 10, P->I = 5]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    // bb0 is NOT assigned — determine_target returns None
    let solver = data.build_in(&body, &heap);

    let region_id = find_region_of(&solver, bb(1));

    // Estimate bb1 for target I with bb0 unassigned.
    // transition_cost(None, Some(I)) finds min over bb0's domain {I, P}:
    //   I: stmt(3) + I→I(0) = 3, transition = 0
    //   P: stmt(7) + P→I(5) = 12, transition = 5
    // Minimum block_cost = 3 → transition = 0
    // Total: stmt_bb1_I(3) + transition(0) = 3
    let cost = CostEstimation {
        config: CostEstimationConfig::TRIVIAL,
        solver: &solver,
        determine_target: |block| solver.targets[block],
    }
    .estimate(&body, region_id, bb(1), I);

    assert_eq!(cost, Some(cost!(3).as_approx()));
}
