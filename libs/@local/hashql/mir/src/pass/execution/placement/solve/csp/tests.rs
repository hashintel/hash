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
            PlacementRegionId, PlacementSolverContext,
            condensation::PlacementRegionKind,
            csp::ConstraintSatisfaction,
            tests::{all_targets, bb, fix_block, stmt_costs, target_set, terminators},
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
    terminators! { terminators;
        bb(0): [I->I = 0, I->P = 0];
        bb(1): [complete(1)];
        bb(2): [
            complete(1);
            complete(1)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    fix_block(&mut csp, bb(0), I);
    csp.narrow(&body, bb(0), I);

    let bb1 = csp.region.find_block(bb(1)).expect("bb1 not found");
    assert_eq!(bb1.possible, target_set(&[I, P]));
    let bb2 = csp.region.find_block(bb(2)).expect("bb2 not found");
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
    terminators! { terminators;
        bb(0): [complete(1)];
        bb(1): [complete(1)];
        bb(2): [
            complete(1);
            I->I = 0, P->I = 0
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    fix_block(&mut csp, bb(0), I);
    csp.narrow(&body, bb(0), I);

    // bb2 is predecessor of bb0. Edge bb2→bb0 only has I→I and P→I.
    // For bb0=I: incoming(I) = {I, P}. So bb2 narrowed to {I, P} (E removed).
    let bb2 = csp.region.find_block(bb(2)).expect("bb2 not found");
    assert_eq!(bb2.possible, target_set(&[I, P]));
    let bb1 = csp.region.find_block(bb(1)).expect("bb1 not found");
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
    terminators! { terminators;
        bb(0): [
            complete(1);
            I->I = 0
        ];
        bb(1): [complete(1)]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    fix_block(&mut csp, bb(0), I);
    csp.narrow(&body, bb(0), I);

    // bb1 had domain {P}, but I→P not in matrix → bb1.possible = empty
    let bb1 = csp.region.find_block(bb(1)).expect("bb1 not found");
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
    terminators! { terminators;
        bb(0): [
            I->I = 0, I->P = 0;
            complete(1)
        ];
        bb(1): [P->P = 0, P->E = 0];
        bb(2): [
            complete(1);
            complete(1)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Assign bb0 = I and narrow
    fix_block(&mut csp, bb(0), I);
    csp.narrow(&body, bb(0), I);

    // bb2 narrowed by bb0→bb2: outgoing(I) = {I, P} → bb2 ∩ {I,P} = {I,P}
    let bb2_after_first = csp.region.find_block(bb(2)).expect("bb2 not found");
    assert!(bb2_after_first.possible.contains(I));
    assert!(bb2_after_first.possible.contains(P));

    // Assign bb1 = P and narrow
    fix_block(&mut csp, bb(1), P);
    csp.narrow(&body, bb(1), P);

    // bb2 further narrowed by bb1→bb2: outgoing(P) = {P, E} → {I,P} ∩ {P,E} = {P}
    let bb2_after_second = csp.region.find_block(bb(2)).expect("bb2 not found");
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
    terminators! { terminators;
        bb(0): [I->I = 0, I->P = 0, P->E = 0];
        bb(1): [complete(1)];
        bb(2): [
            complete(1);
            complete(1)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Step 1: assign bb0 = I, narrow
    fix_block(&mut csp, bb(0), I);
    csp.narrow(&body, bb(0), I);

    let bb1 = csp.region.find_block(bb(1)).expect("bb1 not found");
    assert_eq!(bb1.possible, target_set(&[I, P]));

    // Step 2: change bb0 to P, replay
    csp.region.blocks[0].target = super::super::estimate::HeapElement {
        target: P,
        cost: crate::pass::execution::ApproxCost::ZERO,
    };
    csp.depth = 1;
    csp.replay_narrowing(&body);

    // After replay: bb1 gets P→E only → {E}
    let bb1 = csp.region.find_block(bb(1)).expect("bb1 not found");
    assert_eq!(bb1.possible, target_set(&[E]));
    // bb2 should be reset to original domain (no direct constraint from bb0)
    let bb2 = csp.region.find_block(bb(2)).expect("bb2 not found");
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
    stmt_costs! { statements;
        bb(1): I = 10, P = 20;
        bb(2): I = 5, P = 15
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0)];
        bb(1): [diagonal(0)];
        bb(2): [
            diagonal(0);
            diagonal(0)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Fix bb0 at depth 0
    fix_block(&mut csp, bb(0), I);

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
    terminators! { terminators;
        bb(0): [diagonal(0)];
        bb(1): [I->P = 10, P->I = 3];
        bb(2): [
            diagonal(0);
            diagonal(0)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    fix_block(&mut csp, bb(0), I);

    let lb = csp.lower_bound(&body);
    // stmt costs = 0. Edge bb1→bb2: min over compatible pairs in {I,P}×{I,P}:
    // I→P=10, P→I=3 (no same-target entries in this matrix). min = 3.
    // bb2→bb0: bb0 fixed(I), min(I→I=0, P→I=0) from same_target_matrix = 0.
    // Total = 0 + 3 + 0 = 3
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
    terminators! { terminators;
        bb(0): [
            diagonal(0);
            I->P = 100
        ];
        bb(1): [
            diagonal(0);
            diagonal(0)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
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
        target_set(&[I]),
        all_targets(),
        all_targets(),
    ];
    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0)];
        bb(1): [I->P = 10, I->I = 99];
        bb(2): [
            diagonal(0);
            diagonal(0)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Fix bb0 and bb2 (target=P), leaving bb1 unfixed
    fix_block(&mut csp, bb(0), P);
    fix_block(&mut csp, bb(2), P);

    let lb = csp.lower_bound(&body);
    // bb1 is unfixed, domain = {I}. Edge bb1→bb2: bb2 fixed with target P.
    // Only bb1 candidate: I→P=10 (the concrete target P is used, not the full domain).
    // If the successor weren't fixed, min over {I}×{all} would include I→I=0.
    // Total = 0 (stmts) + 10 (bb1→bb2) = 10
    assert_eq!(lb, cost!(10).as_approx());
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
    stmt_costs! { statements;
        bb(0): I = 10;
        bb(1): I = 5
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            I->I = 3;
            complete(1)
        ];
        bb(1): [complete(1)]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Fix both blocks
    fix_block(&mut csp, bb(0), I);
    fix_block(&mut csp, bb(1), I);

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
    terminators! { terminators;
        bb(0): [complete(1)];
        bb(1): [complete(1)];
        bb(2): [
            complete(1);
            complete(1)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
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
    terminators! { terminators;
        bb(0): [
            complete(1);
            complete(1);
            complete(1)
        ];
        bb(1): [complete(1)];
        bb(2): [complete(1)]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
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
    terminators! { terminators;
        bb(0): [complete(1)];
        bb(1): [complete(1)];
        bb(2): [
            complete(1);
            complete(1)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);
    csp.seed();

    // Fix bb0 at position 0
    fix_block(&mut csp, bb(0), I);

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
    stmt_costs! { statements;
        bb(0): I = 8, P = 3;
        bb(1): I = 8, P = 3
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0), I->P = 5, P->I = 5];
        bb(1): [
            diagonal(0), I->P = 5, P->I = 5;
            diagonal(0), I->P = 5, P->I = 5
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
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
    terminators! { terminators;
        bb(0): [complete(1)];
        bb(1): [I->P = 0];
        bb(2): [
            P->I = 0, P->P = 0;
            complete(1)
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    let bb1_target = csp
        .region
        .find_block(bb(1))
        .expect("bb1 not found")
        .target
        .target;
    let bb2_target = csp
        .region
        .find_block(bb(2))
        .expect("bb2 not found")
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
    terminators! { terminators;
        bb(0): [
            I->I = 0;
            complete(1)
        ];
        bb(1): [P->P = 0]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
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
    stmt_costs! { statements;
        bb(0): I = 10, P = 2;
        bb(1): I = 1, P = 50;
        bb(2): I = 1, P = 50
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            diagonal(0), I->P = 20, P->I = 20;
            diagonal(0), I->P = 20, P->I = 20;
            diagonal(0), I->P = 20, P->I = 20
        ];
        bb(1): [diagonal(0), I->P = 20, P->I = 20];
        bb(2): [diagonal(0), I->P = 20, P->I = 20]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    // all-I = stmt(10+1+1) + trans(0) = 12
    // all-P = stmt(2+50+50) + trans(0) = 102
    // bb0=P,rest=I = stmt(2+1+1) + trans(P→I=20 + P→I=20) = 44
    // BnB must find all-I as optimal.
    for block in &*csp.region.blocks {
        assert_eq!(block.target.target, I);
    }
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
    stmt_costs! { statements;
        bb(0): I = 5, P = 10, E = 15;
        bb(1): I = 5, P = 10, E = 15
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            diagonal(0);
            complete(1)
        ];
        bb(1): [diagonal(0)]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));

    // solve() should apply the optimal solution: (I,I) = 5+5 = 10
    for block in &*csp.region.blocks {
        assert_eq!(block.target.target, I);
    }

    // Ranked alternatives should be retained for retry()
    let solutions = csp.region.solutions.as_ref().expect("solutions missing");
    // Next best is (P,P) = 10+10 = 20, so at least one alternative must be finite
    assert!(solutions[0].cost.is_finite());
    // Solutions must be in non-decreasing cost order
    for window in solutions.windows(2) {
        assert!(
            window[0].cost <= window[1].cost,
            "solutions not ranked: {:?} > {:?}",
            window[0].cost,
            window[1].cost,
        );
    }
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
    stmt_costs! { statements;
        bb(0): I = 1, P = 1;
        bb(1): I = 1, P = 1;
        bb(2): I = 1, P = 1;
        bb(3): I = 1, P = 1
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0), I->P = 100, P->I = 100];
        bb(1): [diagonal(0), I->P = 100, P->I = 100];
        bb(2): [diagonal(0), I->P = 100, P->I = 100];
        bb(3): [
            diagonal(0), I->P = 100, P->I = 100;
            diagonal(0), I->P = 100, P->I = 100
        ]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
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
    stmt_costs! { statements;
        bb(0): I = 1, P = 2;
        bb(1): I = 1, P = 2
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            diagonal(0), I->P = 5, P->I = 5;
            diagonal(0), I->P = 5, P->I = 5
        ];
        bb(1): [diagonal(0), I->P = 5, P->I = 5]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));

    // solve() applies optimal: (I,I) = 1+1 = 2
    let first_bb0 = csp.region.find_block(bb(0)).expect("bb0 not found").target;
    let first_bb1 = csp.region.find_block(bb(1)).expect("bb1 not found").target;
    assert_eq!(first_bb0.target, I);
    assert_eq!(first_bb1.target, I);
    let first_cost = first_bb0.cost + first_bb1.cost;

    // retry() applies next-best: (P,P) = 2+2 = 4
    assert!(csp.retry(&body));
    let second_bb0 = csp.region.find_block(bb(0)).expect("bb0 not found").target;
    let second_bb1 = csp.region.find_block(bb(1)).expect("bb1 not found").target;
    let second_cost = second_bb0.cost + second_bb1.cost;
    assert!(
        second_cost >= first_cost,
        "retry cost {second_cost:?} < solve cost {first_cost:?}",
    );
    // Assignment must differ from the first
    assert!(
        second_bb0.target != first_bb0.target || second_bb1.target != first_bb1.target,
        "retry returned the same assignment as solve",
    );
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

    stmt_costs! { statements;
        bb(0): I = 1, P = 2;
        bb(1): I = 1, P = 2
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            diagonal(0);
            diagonal(0)
        ];
        bb(1): [diagonal(0)]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let (region_id, region) = take_cyclic(&mut solver);
    let mut csp = ConstraintSatisfaction::new(&mut solver, region_id, region);

    assert!(csp.solve(&body));
    // Only same-target transitions allowed, so valid assignments are (I,I) and (P,P).
    // solve() applies the best: (I,I) with cost 1+1 = 2
    let solve_target = csp.region.blocks[0].target.target;
    assert_eq!(solve_target, csp.region.blocks[1].target.target);

    assert!(csp.retry(&body));
    // retry() applies the other: (P,P) with cost 2+2 = 4
    let retry_target = csp.region.blocks[0].target.target;
    assert_eq!(retry_target, csp.region.blocks[1].target.target);
    assert_ne!(retry_target, solve_target);

    // Both valid assignments consumed. No alternatives remain.
    assert!(!csp.retry(&body));
}
