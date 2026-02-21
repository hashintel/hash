#![expect(clippy::min_ident_chars, clippy::missing_asserts_for_indexing)]

use core::mem;

use hashql_core::{heap::Heap, id::IdArray, r#type::environment::Environment};

use super::{super::PlacementSolver, CyclicPlacementRegion};
use crate::{
    body::{basic_block::BasicBlockSlice, location::Location},
    builder::body,
    intern::Interner,
    pass::execution::{
        ApproxCost,
        cost::StatementCostVec,
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

/// Assigns a single block and verifies that direct successors' domains are narrowed.
///
/// Only targets reachable via a valid transition from the assigned target remain
/// in the successor's domain. Non-adjacent blocks are unaffected.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// Assigns a single block and verifies that direct predecessors' domains are narrowed.
///
/// Only targets that can validly transition *to* the assigned target remain in
/// the predecessor's domain. Non-adjacent blocks are unaffected.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// Narrowing empties a successor's domain when no valid transition exists.
///
/// bb0=I and bb1's domain is {P}, but the transition matrix has no I→P entry.
/// The resulting empty domain signals infeasibility to the solver.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// Successive narrowing steps intersect their constraints on a shared neighbor.
///
/// Fixing bb0=I restricts bb2 to {I, P}, then fixing bb1=P further restricts
/// bb2 to {P}. Verifies that narrowing intersects rather than replaces domains.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// Changing a fixed block's target resets unfixed domains and re-narrows from scratch.
///
/// After switching bb0 from I to P, `replay_narrowing` restores original domains
/// for all unfixed blocks and re-propagates constraints from the entire fixed prefix.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// Lower bound sums the minimum statement cost across each unfixed block's domain.
///
/// With zero transition costs, the bound reduces to the sum of per-block minimum
/// statement costs: min(10, 20) + min(5, 15) = 15.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

/// Lower bound includes the minimum valid transition cost for each inter-block edge.
///
/// With zero statement costs, the bound is determined by the cheapest compatible
/// transition across each edge between unfixed blocks.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

/// Self-loop edges are excluded from the lower bound calculation.
///
/// A self-loop is always a same-target transition (cost 0 by definition), so the
/// expensive I→P=100 on the self-loop edge must not inflate the bound.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

/// Lower bound uses a fixed neighbor's concrete target instead of minimizing over its domain.
///
/// When bb2 is fixed to P, the edge bb1→bb2 evaluates transitions against P
/// specifically, not the minimum over all of bb2's original domain.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0)];
        bb(1): [I->P = 10, I->I = 0];
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
    // Only bb1 candidate: I→P=10 (concrete target P used, not the full domain).
    // Same-target I→I is always 0 (TransMatrix forces same-target to 0).
    // Total = 0 (stmts) + 10 (bb1→bb2) = 10
    assert_eq!(lb, cost!(10).as_approx());
}

/// Lower bound is zero when all blocks in the region are fixed.
///
/// With no unfixed blocks remaining, there are no statement or transition costs
/// to estimate. The bound is zero regardless of the cost model.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// MRV selects the unfixed block with the smallest remaining domain.
///
/// Among three unfixed blocks with domain sizes 3, 1, and 2, the block with
/// domain size 1 is selected for earliest failure detection.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// MRV breaks domain-size ties by highest constraint degree.
///
/// All three blocks have domain size 2, but bb0 has the most fixed/boundary
/// neighbors. Selecting the most constrained block promotes early pruning.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// MRV only considers blocks at index ≥ depth, ignoring already-fixed blocks.
///
/// bb0 is fixed at depth 0. Among the remaining unfixed blocks, bb2 has the
/// smallest domain (size 2 vs bb1's size 3) and is selected.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));
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

/// Greedy solver assigns both blocks in a 2-block SCC to the cheapest same-target.
///
/// Both blocks prefer P (statement cost 3 vs 8). Same-target transitions cost 0,
/// so greedy converges on all-P without rollback.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

    csp.seed();
    assert!(csp.run_greedy(&body));
    // Both should be P (3+3+0 = 6 < 8+8+0 = 16)
    for block in &*csp.region.blocks {
        assert_eq!(block.target.target, P);
    }
}

/// Greedy solver recovers from a constraint violation via rollback.
///
/// The initial greedy choice leads to an empty domain for a successor. Rollback
/// to the previous decision point finds an alternative (bb1=I, bb2=P).
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

    csp.seed();
    assert!(csp.run_greedy(&body));
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

/// Greedy solver returns false when no feasible assignment exists.
///
/// bb0's domain is {I} and bb1's domain is {P}, but the transition matrix has
/// no I→P or P→I entries. All paths lead to empty domains.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

    csp.seed();
    assert!(!csp.run_greedy(&body));
}

// --- Group 7: CSP Branch-and-Bound ---

/// `BnB` finds the globally optimal assignment that greedy would miss.
///
/// Greedy picks locally cheap bb0=P (cost 2), but this forces expensive cross-target
/// transitions (20 each). `BnB` explores all branches and finds all-I (cost 12 vs 44).
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

/// `BnB` retains multiple solutions in non-decreasing cost order for retry.
///
/// With diagonal-only transitions, only same-target assignments are valid:
/// `(I,I)=10, (P,P)=20, (E,E)=30`. All three are retained and ranked by cost.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

    // bb0: I=5, P=10, E=15; bb1: I=5, P=10, E=15
    stmt_costs! { statements;
        bb(0): I = 5, P = 10, E = 15;
        bb(1): I = 5, P = 10, E = 15
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

    // solve() should apply the optimal solution: (I,I) = 5+5 = 10
    for block in &*csp.region.blocks {
        assert_eq!(block.target.target, I);
    }

    // Ranked alternatives should be retained for retry()
    let solutions = csp.region.solutions.as_ref().expect("solutions missing");
    // Only same-target assignments valid: (I,I)=10, (P,P)=20, (E,E)=30
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

/// `BnB` pruning does not discard the optimal solution in a 4-block SCC.
///
/// Cross-target transitions cost 100, making any mixed assignment far worse than
/// all-same-target (cost 4). Verifies pruning correctly eliminates suboptimal
/// branches without cutting the optimal one.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

/// After `solve()` applies the optimal assignment, `retry()` returns the next-best.
///
/// `solve()` picks `(I,I)` with cost 2. `retry()` returns `(P,P)` with cost 4. The
/// retry cost must be ≥ the original, and the assignment must differ.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

/// Retry exhausts all ranked solutions and returns false when none remain.
///
/// Only two valid assignments exist: `(I,I)` and `(P,P)`. `solve()` takes the first,
/// `retry()` takes the second, and a third `retry()` returns false.
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
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

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

/// Verifies that greedy rollback succeeds when a block's estimation yields an empty heap.
///
/// After assigning bb0=I, the successor edge bb1→bb0 has no transition to I,
/// making all of bb1's targets infeasible. Rollback flips bb0 to P, and the
/// greedy solver resumes successfully via the `continue` path.
#[test]
fn greedy_rollback_on_empty_heap() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // 2-block SCC: bb0↔bb1, bb2 exit
    // bb0: `if cond then bb1 else bb2` → [bb2(arm0), bb1(arm1)]
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb0(); },
        bb2() { return x; }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

    // bb0: I=0 (cheap, picked first), P=5 (fallback after rollback)
    stmt_costs! { statements;
        bb(0): I = 0, P = 5
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // arm0 (bb0→bb2): complete (exit edge, always feasible)
    // arm1 (bb0→bb1): swap-only transitions (I→P, P→I)
    // bb1→bb0: from I go to P or I
    terminators! { terminators;
        bb(0): [
            complete(0);
            I->P = 0, P->I = 0
        ];
        bb(1): [I->P = 0, I->I = 0]
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
    assert!(csp.run_greedy(&body));

    // bb0=I leads to empty heap for bb1 (narrowing intersection empties domain).
    // Rollback flips bb0 to P, making bb1=I feasible.
    let bb0_target = csp
        .region
        .find_block(bb(0))
        .expect("bb0 not found")
        .target
        .target;
    let bb1_target = csp
        .region
        .find_block(bb(1))
        .expect("bb1 not found")
        .target
        .target;
    assert_eq!(bb0_target, P);
    assert_eq!(bb1_target, I);
}

/// Verifies that `retry()` uses least-delta perturbation after ranked solutions are exhausted.
///
/// A 2-block SCC with three targets produces three ranked `BnB` solutions.
/// After `solve()` and two `retry()` calls consume them, the next `retry()`
/// falls through to perturbation, which finds a heap alternative and calls
/// `run_greedy()` to produce a new assignment.
#[test]
fn retry_perturbation_after_ranked_exhaustion() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // 2-block SCC: bb0↔bb1, bb2 exit
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;
        bb0() { cond = load true; if cond then bb1() else bb2(); },
        bb1() { x = load 0; goto bb0(); },
        bb2() { return x; }
    });

    let domains = [all_targets(), all_targets(), all_targets()];
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new_in(&body.basic_blocks, &heap));

    // Distinct costs so BnB ordering is deterministic
    stmt_costs! { statements;
        bb(0): I = 0, P = 1, E = 100;
        bb(1): I = 0, P = 1, E = 100
    }

    // All transitions allowed → all combinations feasible
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            complete(0);
            complete(0)
        ];
        bb(1): [complete(0)]
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

    // solve() uses BnB (2 blocks ≤ BNB_CUTOFF=12), applies best solution
    assert!(csp.solve(&body));
    let solve_assignment = (
        csp.region.find_block(bb(0)).expect("bb0").target.target,
        csp.region.find_block(bb(1)).expect("bb1").target.target,
    );

    // Consume the two remaining ranked solutions
    assert!(csp.retry(&body));
    assert!(csp.retry(&body));

    let pre_perturbation = (
        csp.region.find_block(bb(0)).expect("bb0").target.target,
        csp.region.find_block(bb(1)).expect("bb1").target.target,
    );

    // This retry exhausts ranked solutions → falls through to perturbation
    assert!(csp.retry(&body));

    let post_perturbation = (
        csp.region.find_block(bb(0)).expect("bb0").target.target,
        csp.region.find_block(bb(1)).expect("bb1").target.target,
    );

    // Perturbation must produce a different assignment than the last ranked one
    assert_ne!(pre_perturbation, post_perturbation);
    // All assignments after perturbation must differ from the initial solve
    assert_ne!(solve_assignment, post_perturbation);
}
