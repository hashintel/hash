#![expect(clippy::min_ident_chars)]

use super::*;
use crate::pass::execution::target::TargetId;

const I: TargetId = TargetId::Interpreter;
const P: TargetId = TargetId::Postgres;
const E: TargetId = TargetId::Embedding;

#[test]
fn heap_insert_maintains_sorted_order() {
    let mut heap = TargetHeap::new();
    heap.insert(P, cost!(30).as_approx());
    heap.insert(I, cost!(10).as_approx());
    heap.insert(E, cost!(20).as_approx());

    let first = heap.pop().unwrap();
    assert_eq!(first.target, I);
    assert_eq!(first.cost, cost!(10).as_approx());

    let second = heap.pop().unwrap();
    assert_eq!(second.target, E);
    assert_eq!(second.cost, cost!(20).as_approx());

    let third = heap.pop().unwrap();
    assert_eq!(third.target, P);
    assert_eq!(third.cost, cost!(30).as_approx());
}

#[test]
fn heap_pop_exhaustion() {
    let mut heap = TargetHeap::new();
    heap.insert(I, cost!(5).as_approx());
    heap.insert(P, cost!(10).as_approx());

    let first = heap.pop().unwrap();
    assert_eq!(first.target, I);
    assert_eq!(first.cost, cost!(5).as_approx());

    let second = heap.pop().unwrap();
    assert_eq!(second.target, P);
    assert_eq!(second.cost, cost!(10).as_approx());

    assert!(heap.pop().is_none());
    assert!(heap.is_empty());
    assert_eq!(heap.len(), 0);
}

#[test]
fn heap_peek_does_not_consume() {
    let mut heap = TargetHeap::new();
    heap.insert(I, cost!(7).as_approx());

    assert_eq!(heap.len(), 1);

    let peeked = heap.peek().unwrap();
    assert_eq!(peeked.target, I);
    assert_eq!(peeked.cost, cost!(7).as_approx());

    let peeked_again = heap.peek().unwrap();
    assert_eq!(peeked_again.target, I);
    assert_eq!(peeked_again.cost, cost!(7).as_approx());

    let popped = heap.pop().unwrap();
    assert_eq!(popped.target, I);
    assert_eq!(popped.cost, cost!(7).as_approx());

    assert_eq!(heap.len(), 0);
    assert!(heap.peek().is_none());
}

#[test]
fn heap_reset_clears_state() {
    let mut heap = TargetHeap::new();
    heap.insert(I, cost!(5).as_approx());
    heap.insert(P, cost!(10).as_approx());

    heap.pop();
    heap.reset();

    assert!(heap.is_empty());
    assert_eq!(heap.len(), 0);
    assert!(heap.pop().is_none());
}

#[test]
fn heap_equal_cost_elements() {
    let mut heap = TargetHeap::new();
    heap.insert(I, cost!(5).as_approx());
    heap.insert(P, cost!(5).as_approx());

    let first = heap.pop().unwrap();
    let second = heap.pop().unwrap();

    assert_eq!(first.cost, cost!(5).as_approx());
    assert_eq!(second.cost, cost!(5).as_approx());

    let mut targets = [first.target, second.target];
    targets.sort();
    let mut expected = [I, P];
    expected.sort();
    assert_eq!(targets, expected);
}

// --- CostEstimation tests ---

use hashql_core::{
    heap::Heap,
    id::{IdArray, bit_vec::FiniteBitSet},
    r#type::environment::Environment,
};

use super::super::{PlacementContext, condensation::PlacementRegionKind};
use crate::{
    body::{basic_block::BasicBlockSlice, location::Location},
    builder::body,
    intern::Interner,
    pass::execution::{
        StatementCostVec,
        target::{TargetArray, TargetBitSet},
        terminator_placement::{TerminatorCostVec, TransMatrix},
    },
};

fn target_set(targets: &[TargetId]) -> TargetBitSet {
    let mut set = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT as u32);
    for &target in targets {
        set.insert(target);
    }
    set
}

fn bb(index: u32) -> BasicBlockId {
    BasicBlockId::new(index)
}

fn find_region_of(
    solver: &super::super::PlacementSolver<
        '_,
        '_,
        impl core::alloc::Allocator,
        impl hashql_core::heap::BumpAllocator,
    >,
    block: BasicBlockId,
) -> super::super::PlacementRegionId {
    for region_id in solver.condensation.reverse_topological_order() {
        match &solver.condensation[region_id].kind {
            PlacementRegionKind::Trivial(trivial) if trivial.block == block => {
                return region_id;
            }
            PlacementRegionKind::Cyclic(cyclic) => {
                if cyclic.members.contains(&block) {
                    return region_id;
                }
            }
            _ => {}
        }
    }
    panic!("no region found for {block:?}");
}

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

    // bb0 statement cost: I=5, P=5
    statements[I][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(5));
    statements[P][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(5));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0 → bb0 (self-loop, arm 0): I→P=100, P→I=100, I→I=0, P→P=0
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(P, P, cost!(0));
        matrix.insert(I, P, cost!(100));
        matrix.insert(P, I, cost!(100));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    // bb0 → bb1 (exit edge, arm 1): all transitions cost 0
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(P, I, cost!(0));
        terminators.of_mut(bb(0))[1] = matrix;
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
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
    // bb0 → bb1: I→P=20, all others=0
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(I, P, cost!(20));
        matrix.insert(P, I, cost!(0));
        matrix.insert(P, P, cost!(0));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    // bb1 → bb2: P→I=20, all others=0
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(I, P, cost!(0));
        matrix.insert(P, I, cost!(20));
        matrix.insert(P, P, cost!(0));
        terminators.of_mut(bb(1))[0] = matrix;
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
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
    // bb0 → bb1: only I→I allowed (no P→anything)
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        terminators.of_mut(bb(0))[0] = matrix;
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
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

    // bb0: I=3, P=7
    statements[I][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(3));
    statements[P][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(7));
    // bb1: I=3, P=7
    statements[I][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(3));
    statements[P][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(7));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0 → bb1: I→I=0, I→P=10, P→I=5, P→P=0
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(I, P, cost!(10));
        matrix.insert(P, I, cost!(5));
        matrix.insert(P, P, cost!(0));
        terminators.of_mut(bb(0))[0] = matrix;
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    // bb0 is NOT assigned — determine_target returns None
    let solver = data.run_in(&body, &heap);

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
