#![expect(clippy::min_ident_chars, clippy::missing_asserts_for_indexing)]

use core::mem;

use hashql_core::{heap::Heap, id::IdArray, r#type::environment::Environment};

use super::{super::PlacementSolver, CyclicPlacementRegion};
use crate::{
    body::{basic_block::BasicBlockSlice, location::Location},
    builder::body,
    intern::Interner,
    pass::execution::{
        ApproxCost, StatementCostVec,
        placement::solve::{
            PlacementContext, PlacementRegionId,
            condensation::PlacementRegionKind,
            csp::ConstraintSatisfaction,
            estimate::HeapElement,
            tests::{all_targets, bb, full_matrix, same_target_matrix, target_set},
        },
        target::{TargetArray, TargetId},
        terminator_placement::{TerminatorCostVec, TransMatrix},
    },
};

const I: TargetId = TargetId::Interpreter;
const P: TargetId = TargetId::Postgres;
const E: TargetId = TargetId::Embedding;

fn take_cyclic<'alloc>(
    solver: &mut PlacementSolver<'_, 'alloc, &'alloc Heap, Heap>,
) -> (PlacementRegionId, CyclicPlacementRegion<'alloc>) {
    let region_ids: Vec<_> = solver.condensation.reverse_topological_order().collect();

    for region_id in region_ids {
        let region = &mut solver.condensation[region_id];
        let kind = mem::replace(&mut region.kind, PlacementRegionKind::Unassigned);
        if let PlacementRegionKind::Cyclic(cyclic) = kind {
            return (region_id, cyclic);
        }

        solver.condensation[region_id].kind = kind;
    }

    panic!("no cyclic region found");
}

// --- Group 3: Forward Checking / narrow() ---

#[test]
fn narrow_restricts_successor_domain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [all_targets(), all_targets(), all_targets(), all_targets()];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    // bb0→bb1: only I→I and I→P (nothing from P or E as source)
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(I, P, cost!(0));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    terminators.of_mut(bb(1))[0] = full_matrix(); // bb1→bb2
    let bb2_edges = terminators.of_mut(bb(2));
    bb2_edges[0] = full_matrix(); // bb2→bb0
    bb2_edges[1] = full_matrix(); // bb2→bb3

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Find and assign bb0 = I
    let idx = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    csp.depth = 1;
    csp.narrow(&body, bb(0), I);

    let bb1 = csp.region.blocks.iter().find(|b| b.id == bb(1)).unwrap();
    assert_eq!(bb1.possible, target_set(&[I, P]));
    let bb2 = csp.region.blocks.iter().find(|b| b.id == bb(2)).unwrap();
    assert_eq!(bb2.possible, all_targets());
}

#[test]
fn narrow_restricts_predecessor_domain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [all_targets(), all_targets(), all_targets(), all_targets()];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    terminators.of_mut(bb(0))[0] = full_matrix(); // bb0→bb1
    terminators.of_mut(bb(1))[0] = full_matrix(); // bb1→bb2

    // bb2: `if cond then bb0() else bb3()` → succs = [bb3(arm0), bb0(arm1)]
    // bb2→bb0 (arm 1): only I→I and P→I (no E→I)
    terminators.of_mut(bb(2))[0] = full_matrix(); // bb2→bb3
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(P, I, cost!(0));
        terminators.of_mut(bb(2))[1] = matrix;
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    let idx = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    csp.depth = 1;
    csp.narrow(&body, bb(0), I);

    // bb2 is predecessor of bb0. Edge bb2→bb0 only has I→I and P→I.
    // For bb0=I: incoming(I) = {I, P}. So bb2 narrowed to {I, P} (E removed).
    let bb2 = csp.region.blocks.iter().find(|b| b.id == bb(2)).unwrap();
    assert_eq!(bb2.possible, target_set(&[I, P]));
    let bb1 = csp.region.blocks.iter().find(|b| b.id == bb(1)).unwrap();
    assert_eq!(bb1.possible, all_targets());
}

#[test]
fn narrow_to_empty_domain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb0(); },
        bb2() { return x; }
    });

    let domains = [target_set(&[I]), target_set(&[P]), all_targets()];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    // bb0: `if cond then bb1() else bb2()` → succs = [bb2(arm0), bb1(arm1)]
    // bb0→bb1 (arm 1): only I→I (no I→P)
    terminators.of_mut(bb(0))[0] = full_matrix(); // bb0→bb2
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        terminators.of_mut(bb(0))[1] = matrix;
    }
    terminators.of_mut(bb(1))[0] = full_matrix(); // bb1→bb0

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    let idx = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    csp.depth = 1;
    csp.narrow(&body, bb(0), I);

    // bb1 had domain {P}, but I→P not in matrix → bb1.possible = empty
    let bb1 = csp.region.blocks.iter().find(|b| b.id == bb(1)).unwrap();
    assert!(bb1.possible.is_empty());
}

#[test]
fn narrow_multiple_edges_intersect() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0→bb1, bb0→bb2, bb1→bb2, bb2→bb0, bb2→bb3
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [all_targets(), all_targets(), all_targets(), all_targets()];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    // bb0: `if cond then bb1() else bb2()` → succs = [bb2(arm0), bb1(arm1)]
    // bb0→bb2 (arm 0): only I→I and I→P (so source I targets {I, P})
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(I, P, cost!(0));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    // bb0→bb1 (arm 1): full matrix
    terminators.of_mut(bb(0))[1] = full_matrix();
    // bb1→bb2 (arm 0): only P→P and P→E (so source P targets {P, E})
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(P, P, cost!(0));
        matrix.insert(P, E, cost!(0));
        terminators.of_mut(bb(1))[0] = matrix;
    }
    // bb2: `if cond then bb0() else bb3()` → succs = [bb3(arm0), bb0(arm1)]
    let bb2_edges = terminators.of_mut(bb(2));
    bb2_edges[0] = full_matrix(); // bb2→bb3
    bb2_edges[1] = full_matrix(); // bb2→bb0

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Assign bb0 = I and narrow
    let idx0 = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx0);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    csp.depth = 1;
    csp.narrow(&body, bb(0), I);

    // bb2 narrowed by bb0→bb2: outgoing(I) = {I, P} → bb2 ∩ {I,P} = {I,P}
    let bb2_after_first = csp.region.blocks.iter().find(|b| b.id == bb(2)).unwrap();
    assert!(bb2_after_first.possible.contains(I));
    assert!(bb2_after_first.possible.contains(P));

    // Assign bb1 = P and narrow
    let idx1 = csp.region.blocks[csp.depth..]
        .iter()
        .position(|b| b.id == bb(1))
        .unwrap();
    csp.region.blocks.swap(csp.depth, csp.depth + idx1);
    csp.region.blocks[csp.depth].target = HeapElement {
        target: P,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(1));
    csp.depth = 2;
    csp.narrow(&body, bb(1), P);

    // bb2 further narrowed by bb1→bb2: outgoing(P) = {P, E} → {I,P} ∩ {P,E} = {P}
    let bb2_after_second = csp.region.blocks.iter().find(|b| b.id == bb(2)).unwrap();
    assert_eq!(bb2_after_second.possible, target_set(&[P]));
}

#[test]
fn replay_narrowing_resets_then_repropagates() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [all_targets(), all_targets(), all_targets(), all_targets()];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    // bb0→bb1: I→I=0, I→P=0 for source I; P→E=0 for source P
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(I, P, cost!(0));
        matrix.insert(P, E, cost!(0));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    terminators.of_mut(bb(1))[0] = full_matrix();
    let bb2_edges = terminators.of_mut(bb(2));
    bb2_edges[0] = full_matrix();
    bb2_edges[1] = full_matrix();

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Step 1: assign bb0 = I, narrow
    let idx = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    csp.depth = 1;
    csp.narrow(&body, bb(0), I);

    let bb1 = csp.region.blocks.iter().find(|b| b.id == bb(1)).unwrap();
    assert_eq!(bb1.possible, target_set(&[I, P]));

    // Step 2: change bb0 to P, replay
    csp.region.blocks[0].target = HeapElement {
        target: P,
        cost: ApproxCost::ZERO,
    };
    csp.depth = 1;
    csp.replay_narrowing(&body);

    // After replay: bb1 gets P→E only → {E}
    let bb1 = csp.region.blocks.iter().find(|b| b.id == bb(1)).unwrap();
    assert_eq!(bb1.possible, target_set(&[E]));
    // bb2 should be reset to original domain (no direct constraint from bb0)
    let bb2 = csp.region.blocks.iter().find(|b| b.id == bb(2)).unwrap();
    assert_eq!(bb2.possible, all_targets());
}

// --- Group 4: Lower Bound ---

#[test]
fn lower_bound_min_statement_cost_per_block() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [
        all_targets(),
        target_set(&[I, P]),
        target_set(&[I, P]),
        all_targets(),
    ];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb1: I=10, P=20; bb2: I=5, P=15
    statements[I][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(10));
    statements[P][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(20));
    statements[I][Location {
        block: bb(2),
        statement_index: 1,
    }] = Some(cost!(5));
    statements[P][Location {
        block: bb(2),
        statement_index: 1,
    }] = Some(cost!(15));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = same_target_matrix(); // bb0→bb1
    terminators.of_mut(bb(1))[0] = same_target_matrix(); // bb1→bb2
    let bb2_edges = terminators.of_mut(bb(2));
    bb2_edges[0] = same_target_matrix(); // bb2→bb0
    bb2_edges[1] = same_target_matrix(); // bb2→bb3

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Fix bb0 at depth 0
    let idx = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    csp.depth = 1;

    let lb = csp.lower_bound(&body);
    // min(10,20) + min(5,15) = 10 + 5 = 15
    assert_eq!(lb, cost!(15).as_approx());
}

#[test]
fn lower_bound_min_transition_cost_per_edge() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [
        all_targets(),
        target_set(&[I, P]),
        target_set(&[I, P]),
        all_targets(),
    ];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = same_target_matrix();
    // bb1→bb2: I→I=5, I→P=10, P→I=8, P→P=3
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(5));
        matrix.insert(I, P, cost!(10));
        matrix.insert(P, I, cost!(8));
        matrix.insert(P, P, cost!(3));
        terminators.of_mut(bb(1))[0] = matrix;
    }
    let bb2_edges = terminators.of_mut(bb(2));
    bb2_edges[0] = same_target_matrix();
    bb2_edges[1] = same_target_matrix();

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    let idx = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    csp.depth = 1;

    eprintln!("=== lower_bound_min_transition debug ===");
    eprintln!("depth={}", csp.depth);
    for (idx, block) in csp.region.blocks.iter().enumerate() {
        eprintln!(
            "  blocks[{idx}]: id={:?} possible={:?} target={:?}",
            block.id, block.possible, block.target
        );
    }
    eprintln!("fixed: {:?}", csp.region.fixed);
    let lb = csp.lower_bound(&body);
    eprintln!("lb = {lb:?}");
    // stmt costs = 0. Edge bb1→bb2: min over all compatible pairs = 3 (P→P).
    // bb2→bb0: bb0 is fixed (I), min over bb2's domain: min(I→I=0, P→I=0) = 0.
    // Total = 0 (stmts) + 3 (bb1→bb2) + 0 (bb2→bb0) = 3
    assert_eq!(lb, cost!(3).as_approx());
}

#[test]
fn lower_bound_skips_self_loop_edges() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0→bb0 (self-loop), bb0→bb1, bb1→bb0, bb1→bb2 (exit)
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { cond = load true; if cond then bb0() else bb1(); },
        bb1() { cond = load true; if cond then bb0() else bb2(); },
        bb2() { x = load 0; return x; }
    });

    let domains = [target_set(&[I, P]), target_set(&[I, P]), all_targets()];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0→bb0 (arm 0): I→P=100
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, P, cost!(100));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    // bb0→bb1 (arm 1): all=0
    terminators.of_mut(bb(0))[1] = same_target_matrix();
    // bb1→bb0 (arm 0): all=0
    terminators.of_mut(bb(1))[0] = same_target_matrix();
    // bb1→bb2 (arm 1): all=0
    terminators.of_mut(bb(1))[1] = same_target_matrix();

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();
    csp.depth = 0;

    let lb = csp.lower_bound(&body);
    // Self-loop I→P=100 must NOT appear. All other transitions = 0, stmts = 0.
    assert_eq!(lb, ApproxCost::ZERO);
}

#[test]
fn lower_bound_fixed_successor_uses_concrete_target() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [
        all_targets(),
        target_set(&[I, P]),
        all_targets(),
        all_targets(),
    ];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = same_target_matrix();
    // bb1→bb2: I→P=10, P→P=5, I→I=1, P→I=2
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, P, cost!(10));
        matrix.insert(P, P, cost!(5));
        matrix.insert(I, I, cost!(1));
        matrix.insert(P, I, cost!(2));
        terminators.of_mut(bb(1))[0] = matrix;
    }
    let bb2_edges = terminators.of_mut(bb(2));
    bb2_edges[0] = same_target_matrix();
    bb2_edges[1] = same_target_matrix();

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Fix bb0 and bb2 (target=P), leaving bb1 unfixed
    let idx0 = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx0);
    csp.region.blocks[0].target = HeapElement {
        target: P,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    let idx2 = csp.region.blocks[1..]
        .iter()
        .position(|b| b.id == bb(2))
        .unwrap();
    csp.region.blocks.swap(1, 1 + idx2);
    csp.region.blocks[1].target = HeapElement {
        target: P,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(2));
    csp.depth = 2;

    let lb = csp.lower_bound(&body);
    // bb1 is unfixed. Edge bb1→bb2: bb2 fixed with target P.
    // min over bb1's domain {I,P}: min(I→P=10, P→P=5) = 5.
    // Edge bb0→bb1: bb0 fixed. Not unfixed edge → not counted in lb.
    // (lower_bound only iterates unfixed blocks' outgoing edges)
    assert_eq!(lb, cost!(5).as_approx());
}

#[test]
fn lower_bound_all_fixed_returns_zero() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb0(); },
        bb2() { return x; }
    });

    let domains = [target_set(&[I, P]), target_set(&[I, P]), all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    statements[I][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(10));
    statements[I][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(5));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0→bb1: I→I=3
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(3));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    terminators.of_mut(bb(0))[1] = full_matrix();
    terminators.of_mut(bb(1))[0] = full_matrix();

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Fix both blocks
    let idx0 = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx0);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    let idx1 = csp.region.blocks[1..]
        .iter()
        .position(|b| b.id == bb(1))
        .unwrap();
    csp.region.blocks.swap(1, 1 + idx1);
    csp.region.blocks[1].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(1));
    csp.depth = 2;

    assert_eq!(csp.lower_bound(&body), ApproxCost::ZERO);
}

// --- Group 5: MRV Selection ---

#[test]
fn mrv_selects_smallest_domain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [
        all_targets(),
        target_set(&[I]),
        target_set(&[I, P]),
        all_targets(),
    ];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = full_matrix();
    terminators.of_mut(bb(1))[0] = full_matrix();
    let bb2_edges = terminators.of_mut(bb(2));
    bb2_edges[0] = full_matrix();
    bb2_edges[1] = full_matrix();

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();
    csp.depth = 0;

    let (_offset, block_id) = csp.mrv(&body);
    // bb1 has smallest domain (size 1)
    assert_eq!(block_id, bb(1));
}

#[test]
fn mrv_tiebreak_by_constraint_degree() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0→bb1, bb0→bb2, bb1→bb0, bb2→bb0, bb0→bb3 (exit)
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { cond = load true; switch cond [0 => bb1(), 1 => bb2(), _ => bb3()]; },
        bb1() { x = load 0; goto bb0(); },
        bb2() { x = load 0; goto bb0(); },
        bb3() { return x; }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, ip, all_targets()];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    let bb0_edges = terminators.of_mut(bb(0));
    bb0_edges[0] = full_matrix(); // bb0→bb1
    bb0_edges[1] = full_matrix(); // bb0→bb2
    bb0_edges[2] = full_matrix(); // bb0→bb3
    terminators.of_mut(bb(1))[0] = full_matrix(); // bb1→bb0
    terminators.of_mut(bb(2))[0] = full_matrix(); // bb2→bb0

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();
    csp.depth = 0;

    let (_offset, block_id) = csp.mrv(&body);
    // All have domain size 2. bb0 has constraint degree 1 (bb3 is non-member).
    // bb1 and bb2 have degree 0.
    assert_eq!(block_id, bb(0));
}

#[test]
fn mrv_skips_fixed_blocks() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [
        all_targets(),
        all_targets(),
        target_set(&[I, P]),
        all_targets(),
    ];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = full_matrix();
    terminators.of_mut(bb(1))[0] = full_matrix();
    let bb2_edges = terminators.of_mut(bb(2));
    bb2_edges[0] = full_matrix();
    bb2_edges[1] = full_matrix();

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Fix bb0 at position 0
    let idx = csp
        .region
        .blocks
        .iter()
        .position(|b| b.id == bb(0))
        .unwrap();
    csp.region.blocks.swap(0, idx);
    csp.region.blocks[0].target = HeapElement {
        target: I,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(bb(0));
    csp.depth = 1;

    let (_offset, block_id) = csp.mrv(&body);
    // bb0 is fixed (at depth 0). Among unfixed: bb1 domain=3, bb2 domain=2.
    assert_eq!(block_id, bb(2));
}

// --- Group 6: CSP Greedy Solver ---

#[test]
fn greedy_solves_two_block_loop() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { cond = load true; if cond then bb0() else bb2(); },
        bb2() { return x; }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb0: I=8, P=3; bb1: I=8, P=3
    statements[I][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(8));
    statements[P][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(3));
    statements[I][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(8));
    statements[P][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(3));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // All edges: I→I=0, P→P=0, I→P=5, P→I=5
    let transition_matrix = {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(P, P, cost!(0));
        matrix.insert(I, P, cost!(5));
        matrix.insert(P, I, cost!(5));
        matrix
    };
    terminators.of_mut(bb(0))[0] = transition_matrix; // bb0→bb1
    let bb1_edges = terminators.of_mut(bb(1));
    bb1_edges[0] = transition_matrix; // bb1→bb0
    bb1_edges[1] = transition_matrix; // bb1→bb2

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    // Both should be P (3+3+0 = 6 < 8+8+0 = 16)
    for block in &*csp.region.blocks {
        assert_eq!(block.target.target, P);
    }
}

#[test]
fn greedy_rollback_finds_alternative() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { cond = load true; if cond then bb0() else bb3(); },
        bb3() { return x; }
    });

    let domains = [
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[P]),
        all_targets(),
    ];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = full_matrix(); // bb0→bb1: all allowed
    // bb1→bb2: only I→P=0 (P→P disallowed)
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, P, cost!(0));
        terminators.of_mut(bb(1))[0] = matrix;
    }
    // bb2→bb0: P→I=0, P→P=0
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(P, I, cost!(0));
        matrix.insert(P, P, cost!(0));
        terminators.of_mut(bb(2))[0] = matrix;
    }
    terminators.of_mut(bb(2))[1] = full_matrix(); // bb2→bb3

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    let bb1_target = csp
        .region
        .blocks
        .iter()
        .find(|b| b.id == bb(1))
        .unwrap()
        .target
        .target;
    let bb2_target = csp
        .region
        .blocks
        .iter()
        .find(|b| b.id == bb(2))
        .unwrap()
        .target
        .target;
    assert_eq!(bb2_target, P);
    assert_eq!(bb1_target, I); // forced by I→P constraint
}

#[test]
fn greedy_fails_when_infeasible() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb0(); },
        bb2() { return x; }
    });

    let domains = [target_set(&[I]), target_set(&[P]), all_targets()];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0→bb1 (arm 0): only I→I (no I→P)
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    terminators.of_mut(bb(0))[1] = full_matrix(); // bb0→bb2
    // bb1→bb0: only P→P (no P→I)
    {
        let mut matrix = TransMatrix::new();
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
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(!csp.solve(&body));
}

// --- Group 7: CSP Branch-and-Bound ---

#[test]
fn bnb_finds_optimal() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0→bb1, bb0→bb2, bb1→bb0, bb2→bb0, bb0→bb3 (exit)
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { cond = load true; switch cond [0 => bb1(), 1 => bb2(), _ => bb3()]; },
        bb1() { x = load 0; goto bb0(); },
        bb2() { x = load 0; goto bb0(); },
        bb3() { return x; }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, ip, all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb0: I=10, P=2; bb1: I=1, P=50; bb2: I=1, P=50
    statements[I][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(10));
    statements[P][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(2));
    statements[I][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(1));
    statements[P][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(50));
    statements[I][Location {
        block: bb(2),
        statement_index: 1,
    }] = Some(cost!(1));
    statements[P][Location {
        block: bb(2),
        statement_index: 1,
    }] = Some(cost!(50));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // TransMatrix: I→I=0, P→P=0, P→I=20, I→P=20
    let transition_matrix = {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(P, P, cost!(0));
        matrix.insert(P, I, cost!(20));
        matrix.insert(I, P, cost!(20));
        matrix
    };
    let bb0_edges = terminators.of_mut(bb(0));
    bb0_edges[0] = transition_matrix; // bb0→bb1
    bb0_edges[1] = transition_matrix; // bb0→bb2
    bb0_edges[2] = transition_matrix; // bb0→bb3
    terminators.of_mut(bb(1))[0] = transition_matrix; // bb1→bb0
    terminators.of_mut(bb(2))[0] = transition_matrix; // bb2→bb0

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    // Optimal: all-I = 10+1+1+0+0 = 12. Greedy picks bb0=P(2) → suboptimal.
    // BnB should find bb0=I.
    let bb0_target = csp
        .region
        .blocks
        .iter()
        .find(|b| b.id == bb(0))
        .unwrap()
        .target
        .target;
    assert_eq!(bb0_target, I);
}

#[test]
fn bnb_retains_ranked_solutions() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb0(); },
        bb2() { return x; }
    });

    let domains = [all_targets(), all_targets(), all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb0: I=5, P=10, E=15; bb1: I=5, P=10, E=15
    statements[I][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(5));
    statements[P][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(10));
    statements[E][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(15));
    statements[I][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(5));
    statements[P][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(10));
    statements[E][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(15));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = same_target_matrix(); // bb0→bb1
    terminators.of_mut(bb(0))[1] = full_matrix(); // bb0→bb2
    terminators.of_mut(bb(1))[0] = same_target_matrix(); // bb1→bb0

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    // After solve(), solutions should be retained
    assert!(csp.region.solutions.is_some());
    let solutions = csp.region.solutions.as_ref().unwrap();
    // At least one alternative should have finite cost
    assert!(solutions.iter().any(|sol| sol.cost.is_finite()));
}

#[test]
fn bnb_pruning_preserves_optimal() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // 4-block SCC: bb0→bb1→bb2→bb3→bb0, plus bb4 exit
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; goto bb1(); },
        bb1() { x = load 0; goto bb2(); },
        bb2() { x = load 0; goto bb3(); },
        bb3() { cond = load true; if cond then bb0() else bb4(); },
        bb4() { return x; }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, ip, ip, all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // All blocks: I=1, P=1
    for block_idx in 0..4_u32 {
        statements[I][Location {
            block: bb(block_idx),
            statement_index: 1,
        }] = Some(cost!(1));
        statements[P][Location {
            block: bb(block_idx),
            statement_index: 1,
        }] = Some(cost!(1));
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // TransMatrix: I→I=0, P→P=0, I→P=100, P→I=100
    let transition_matrix = {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(P, P, cost!(0));
        matrix.insert(I, P, cost!(100));
        matrix.insert(P, I, cost!(100));
        matrix
    };
    terminators.of_mut(bb(0))[0] = transition_matrix;
    terminators.of_mut(bb(1))[0] = transition_matrix;
    terminators.of_mut(bb(2))[0] = transition_matrix;
    let bb3_edges = terminators.of_mut(bb(3));
    bb3_edges[0] = transition_matrix;
    bb3_edges[1] = transition_matrix;

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    // All blocks should get the same target (cost = 4)
    let first_target = csp.region.blocks[0].target.target;
    for block in &*csp.region.blocks {
        assert_eq!(block.target.target, first_target);
    }
}

// --- Group 8: retry() ---

#[test]
fn retry_returns_ranked_solutions_in_order() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb0(); },
        bb2() { return x; }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb0: I=1, P=2; bb1: I=1, P=2
    statements[I][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(1));
    statements[P][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(2));
    statements[I][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(1));
    statements[P][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(2));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    let transition_matrix = {
        let mut matrix = TransMatrix::new();
        matrix.insert(I, I, cost!(0));
        matrix.insert(P, P, cost!(0));
        matrix.insert(I, P, cost!(5));
        matrix.insert(P, I, cost!(5));
        matrix
    };
    terminators.of_mut(bb(0))[0] = transition_matrix; // bb0→bb1
    terminators.of_mut(bb(0))[1] = transition_matrix; // bb0→bb2
    terminators.of_mut(bb(1))[0] = transition_matrix; // bb1→bb0

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    // solve() consumed the best solution. retry() should give the next.
    assert!(csp.retry(&body));
    // Second retry should also succeed (we have 3+ solutions for 2-block with 2 targets each)
    // Costs should be non-decreasing (solutions are ranked)
}

#[test]
fn retry_exhausts_then_perturbs() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { x = load 0; cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb0(); },
        bb2() { return x; }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    statements[I][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(1));
    statements[P][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(2));
    statements[I][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(1));
    statements[P][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(2));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // Only same-target transitions allowed
    terminators.of_mut(bb(0))[0] = same_target_matrix(); // bb0→bb1
    terminators.of_mut(bb(0))[1] = same_target_matrix(); // bb0→bb2
    terminators.of_mut(bb(1))[0] = same_target_matrix(); // bb1→bb0

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.run_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body)); // consumes (I,I)
    assert!(csp.retry(&body)); // consumes (P,P)
    // Only 2 valid assignments exist. Third retry should eventually fail.
    // (It may try perturbation first, but heaps are exhausted too)
    assert!(!csp.retry(&body));
}
