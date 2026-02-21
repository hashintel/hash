#![expect(clippy::min_ident_chars)]

use core::alloc::Allocator;

use hashql_core::{
    heap::{BumpAllocator, Heap},
    id::{IdArray, bit_vec::FiniteBitSet},
    r#type::environment::Environment,
};
use hashql_diagnostics::severity::Severity;

use super::{
    PlacementFailure, PlacementRegionId, PlacementSolver, PlacementSolverContext,
    condensation::PlacementRegionKind, csp::ConstraintSatisfaction,
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
        location::Location,
    },
    builder::body,
    context::MirContext,
    error::MirDiagnosticCategory,
    intern::Interner,
    pass::execution::{
        ApproxCost, Cost, StatementCostVec,
        placement::error::PlacementDiagnosticCategory,
        target::{TargetArray, TargetBitSet, TargetId},
        terminator_placement::{TerminatorCostVec, TransMatrix},
    },
};

macro_rules! stmt_costs {
    {$stmts:expr; $(bb($block:literal): $($target:ident = $cost:expr),+);+ $(;)?} => {
        $($(
            $stmts[$target][Location {
                block: bb($block),
                statement_index: 1,
            }] = Some(cost!($cost));
        )+)+
    };
}

pub(crate) use stmt_costs;

pub(crate) fn set_diagonal_matrix(matrix: &mut TransMatrix, cost: Cost) {
    for target in TargetId::all() {
        matrix.insert(target, target, cost);
    }
}

pub(crate) fn set_complete_matrix(matrix: &mut TransMatrix, cost: Cost) {
    for source in TargetId::all() {
        for target in TargetId::all() {
            matrix.insert(source, target, cost);
        }
    }
}

macro_rules! terminators {
    { $term:expr; $(bb($block:literal): [$($arms:tt)*]);+ $(;)? } => {
        $(
            terminators!(@entry $term; $block; 0; $($arms)*);
        )*
    };
    (@entry $term:expr; $block:literal; $depth:expr;) => {};
    (@entry $term:expr; $block:literal; $depth:expr; $($arms:tt)+) => {
        let mut matrix = TransMatrix::new();
        terminators!(@impl $term; $block; matrix; $depth; , $($arms)*);
    };
    (@impl $term:expr; $block:literal; $matrix:ident; $depth:expr;) => {
        $term.of_mut(bb($block))[$depth] = $matrix;
    };
    (@impl $term:expr; $block:literal; $matrix:ident; $depth:expr; ; $($rest:tt)*) => {
        $term.of_mut(bb($block))[$depth] = $matrix;
        terminators!(@entry $term; $block; $depth + 1; $($rest)*);
    };
    (@impl $term:expr; $block:literal; $matrix:ident; $depth:expr; , $source:ident -> $target:ident = $cost:literal $($rest:tt)*) => {
        $matrix.insert($source, $target, cost!($cost));
        terminators!(@impl $term; $block; $matrix; $depth; $($rest)*);
    };
    (@impl $term:expr; $block:literal; $matrix:ident; $depth:expr; , diagonal($cost:literal) $($rest:tt)*) => {
        $crate::pass::execution::placement::solve::tests::set_diagonal_matrix(&mut $matrix, cost!($cost));
        terminators!(@impl $term; $block; $matrix; $depth; $($rest)*);
    };
    (@impl $term:expr; $block:literal; $matrix:ident; $depth:expr; , complete($cost:literal) $($rest:tt)*) => {
        $crate::pass::execution::placement::solve::tests::set_complete_matrix(&mut $matrix, cost!($cost));
        terminators!(@impl $term; $block; $matrix; $depth; $($rest)*);
    };
}

pub(crate) use terminators;

pub(crate) fn target_set(targets: &[TargetId]) -> TargetBitSet {
    let mut set = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT_U32);
    for &target in targets {
        set.insert(target);
    }
    set
}

pub(crate) fn all_targets() -> TargetBitSet {
    target_set(&[
        TargetId::Interpreter,
        TargetId::Postgres,
        TargetId::Embedding,
    ])
}

pub(crate) fn bb(index: u32) -> BasicBlockId {
    BasicBlockId::new(index)
}

const I: TargetId = TargetId::Interpreter;
const P: TargetId = TargetId::Postgres;

pub(crate) fn run_solver<'heap>(
    body: &Body<'heap>,
    env: &Environment<'heap>,
    interner: &Interner<'heap>,
    domains: &[TargetBitSet],
    statements: &TargetArray<StatementCostVec<&'heap Heap>>,
    terminators: &TerminatorCostVec<&'heap Heap>,
) -> BasicBlockVec<TargetId, &'heap Heap> {
    let mut context = MirContext::new(env, interner);
    let assignment = BasicBlockSlice::from_raw(domains);
    let data = PlacementSolverContext {
        assignment,
        statements,
        terminators,
    };
    let mut solver = data.build_in(body, env.heap);
    solver.run(&mut context, body)
}

pub(crate) fn find_region_of(
    solver: &PlacementSolver<'_, '_, impl Allocator, impl BumpAllocator>,
    block: BasicBlockId,
) -> PlacementRegionId {
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
            PlacementRegionKind::Trivial(_) | PlacementRegionKind::Unassigned => {}
        }
    }

    panic!("no region found for {block:?}");
}

pub(crate) fn fix_block(
    csp: &mut ConstraintSatisfaction<'_, '_, '_, impl Allocator, impl BumpAllocator>,
    block: BasicBlockId,
    target: TargetId,
) {
    let depth = csp.depth;
    let idx = csp.region.blocks[depth..]
        .iter()
        .position(|placement| placement.id == block)
        .expect("block not found in unfixed region");
    csp.region.blocks.swap(depth, depth + idx);
    csp.region.blocks[depth].target = super::estimate::HeapElement {
        target,
        cost: ApproxCost::ZERO,
    };
    csp.region.fixed.insert(block);
    csp.depth = depth + 1;
}

/// Verifies that every block receives a valid target assignment after the forward pass.
///
/// Diamond CFG with all transitions allowed at uniform cost. The specific target
/// chosen is unimportant; the contract is that no block remains unassigned.
#[test]
fn forward_pass_assigns_all_blocks() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3();
        },
        bb2() {
            goto bb3();
        },
        bb3() {
            x = load 0;
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, ip, ip];

    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            complete(1);
            complete(1)
        ];
        bb(1): [complete(1)];
        bb(2): [complete(1)]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    for block_id in 0..4_u32 {
        let target = result[bb(block_id)];
        assert!(
            target == I || target == P,
            "bb{block_id} should be assigned a valid target, got {target:?}",
        );
    }
}

/// Verifies the backward pass corrects a suboptimal forward assignment.
///
/// Forward picks bb1=P because bb3 is unassigned and the heuristic sees cheap P→P.
/// After bb2=I with diagonal-only forces bb3=I, backward re-evaluates bb1 with
/// bb3=I known and corrects bb1 from P to I.
#[test]
fn backward_pass_improves_suboptimal_forward() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Diamond: bb0 → bb1, bb0 → bb2, bb1 → bb3, bb2 → bb3. Four trivial SCCs.
    //
    // Forward processes in topological order: bb0, then bb1 and bb2 (one before
    // the other), then bb3. When estimating bb1, bb3 is unassigned so the
    // heuristic considers bb3's full domain {I,P}. The P→P=0 transition makes
    // bb1=P look cheap. But bb3 ultimately gets I (because bb2=I with diagonal-
    // only forces bb3=I after backward). Backward then re-evaluates bb1 with
    // bb3=I known and sees P→I=50, correcting bb1 to I.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 0;
            goto bb3();
        },
        bb2() {
            x = load 0;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    // bb0 forced to I; bb1/bb2/bb3 have both targets
    let domains = [target_set(&[I]), ip, ip, ip];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb1: P is locally cheaper. bb2: I is locally cheaper (forces bb3 toward I).
    stmt_costs! { statements;
        bb(1): I = 10, P = 2;
        bb(2): I = 1, P = 50
    }

    // bb0: arm0=bb2(else), arm1=bb1(then). All transitions at cost 0.
    // bb1→bb3: P→P=0 (cheap), P→I=50 (expensive), I→I=0.
    // bb2→bb3: same-target only (diagonal).
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            complete(0);
            complete(0)
        ];
        bb(1): [diagonal(0), P->I = 50];
        bb(2): [diagonal(0)]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], I);
    // bb2 picks I (stmt 1 vs 50). bb2→bb3 diagonal-only forces bb3=I.
    assert_eq!(result[bb(2)], I);
    assert_eq!(result[bb(3)], I);
    // Forward heuristic for bb1=P with bb3 unassigned: P→P=0, P→I=50.
    //   min block_cost: P→P with stmt_bb3_P(1)+0=1 → transition=0. Total: 2+0+0=2
    // Forward heuristic for bb1=I: I→I=0, stmt_bb3_I(1)+0=1 → transition=0.
    //   Total: 10+0+0=10. Forward picks P.
    // Backward with bb3=I known: bb1=P: 2+0+50=52. bb1=I: 10+0+0=10.
    // Backward corrects bb1 to I.
    assert_eq!(result[bb(1)], I);
}

/// Verifies that forward rewind resolves a join point with conflicting predecessors.
///
/// bb1→bb3 allows only diagonal transitions and bb2→bb3 allows only swaps. When
/// both predecessors pick the same target, no assignment for bb3 satisfies both
/// edges simultaneously, forcing the forward pass to rewind and retry.
#[test]
fn rewind_triggers_on_join_with_conflicting_predecessors() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Diamond: bb0 → bb1, bb0 → bb2, bb1 → bb3, bb2 → bb3.
    // bb1→bb3 is same-target only (diagonal). bb2→bb3 is swap only (I→P, P→I).
    // Forward picks I for both bb1 and bb2 (cheaper stmt). Then bb3:
    //   bb3=I: bb1→bb3 I→I ok, bb2→bb3 I→I missing → infeasible
    //   bb3=P: bb1→bb3 I→P missing → infeasible
    // bb3 heap empty → rewind flips bb2 (or bb1) to resolve the conflict.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 0;
            goto bb3();
        },
        bb2() {
            x = load 0;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    // bb0 forced to I; bb1, bb2, bb3 can be I or P
    let domains = [target_set(&[I]), ip, ip, ip];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // Bias bb1 and bb2 to pick I initially
    stmt_costs! { statements;
        bb(1): I = 0, P = 10;
        bb(2): I = 0, P = 10
    }

    // bb0: arm0=bb2(else), arm1=bb1(then). All transitions allowed.
    // bb1→bb3: same-target only. bb2→bb3: swap only.
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            complete(0);
            complete(0)
        ];
        bb(1): [diagonal(0)];
        bb(2): [I->P = 0, P->I = 0]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], I);
    // Only consistent solutions: (bb1=I, bb2=P, bb3=I) or (bb1=P, bb2=I, bb3=P)
    match result[bb(3)] {
        target if target == I => {
            assert_eq!(result[bb(1)], I);
            assert_eq!(result[bb(2)], P);
        }
        target if target == P => {
            assert_eq!(result[bb(1)], P);
            assert_eq!(result[bb(2)], I);
        }
        other => panic!("bb3 must be I or P, got {other:?}"),
    }
}

/// Verifies that rewind skips regions with no alternative targets.
///
/// bb2 has a single-target domain {I}, so it offers no alternatives. When bb3
/// becomes infeasible, rewind must skip the exhausted bb2 and flip bb1 instead.
#[test]
fn rewind_skips_exhausted_region() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 → bb1, bb1 → bb2 (then), bb1 → bb3 (else), bb2 → bb3.
    // bb1→bb3 (arm0) is swap only: I→P, P→I. bb1→bb2 (arm1) allows I→I, P→I.
    // bb2→bb3 allows only I→I. bb2 domain = {I} (single target, no alternatives).
    //
    // Forward: bb0=I (forced). bb1 picks I (cheaper stmt).
    //   bb2=I (forced domain). bb3 estimation: from bb1=I (bb1→bb3: I→P only,
    //   need I→I for bb3=I → missing) and from bb2=I (I→I → ok for bb3=I).
    //   bb3=I: bb1→bb3 I→I missing → infeasible.
    //   bb3=P: bb2→bb3 I→P missing → infeasible.
    //   bb3 heap empty → rewind.
    // Rewind: bb2 has no alternatives (domain {I}) → skip. bb1 has alternative P.
    //   bb1=P, resume. bb2=I (re-estimated). bb3: bb1→bb3 P→I ok, bb2→bb3 I→I ok.
    //   bb3=I succeeds.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            cond = load true;
            if cond then bb2() else bb3();
        },
        bb2() {
            x = load 0;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    // bb1: arm0=bb3(else), arm1=bb2(then)
    let domains = [
        target_set(&[I]),
        target_set(&[I, P]),
        target_set(&[I]),
        target_set(&[I, P]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(1): I = 0, P = 10
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [complete(0)];
        bb(1): [
            I->P = 0, P->I = 0;
            I->I = 0, P->I = 0
        ];
        bb(2): [I->I = 0]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], I);
    assert_eq!(result[bb(1)], P);
    assert_eq!(result[bb(2)], I);
    assert_eq!(result[bb(3)], I);
}

/// Verifies the trivial region fast path picks the cheapest target by statement cost.
///
/// Single block with a return terminator and no edges. The solver should select
/// the target with the lowest per-statement cost without consulting any neighbors.
#[test]
fn single_block_trivial_region() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 0;
            return x;
        }
    });

    let domains = [target_set(&[I, P])];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(0): I = 10, P = 5
    }

    let terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], P);
}

/// Verifies the solver handles cyclic and trivial regions together.
///
/// bb1↔bb2 form a 2-block SCC with bb0 and bb3 as trivial boundary regions.
/// The forward and backward passes must process both region kinds correctly.
#[test]
fn cyclic_region_in_forward_backward() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 → bb1, bb1 → bb2, bb2 → bb1 (loop), bb2 → bb3 (exit)
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            x = load 0;
            goto bb2();
        },
        bb2() {
            cond = load true;
            if cond then bb1() else bb3();
        },
        bb3() {
            return x;
        }
    });

    let domains = [
        target_set(&[I]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(1): I = 3, P = 1;
        bb(2): I = 3, P = 1
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [I->I = 0, I->P = 5];
        bb(1): [diagonal(0), I->P = 5, P->I = 5];
        bb(2): [
            diagonal(0), I->P = 5, P->I = 5;
            I->I = 0, P->I = 5
        ]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], I);
    assert_eq!(result[bb(3)], I);
    // SCC {bb1, bb2}: all-I feasible (stmt 6 + boundary 0 = 6).
    // all-P infeasible: bb2→bb1 backedge (arm1) lacks P→P transition.
    // Solver picks I for both.
    assert_eq!(result[bb(1)], I);
    assert_eq!(result[bb(2)], I);
}

/// Verifies that rewind walks back into a cyclic region and uses `retry()` to find an alternative.
///
/// The SCC exit edge is diagonal, so the SCC solver sees both all-I and all-P
/// as feasible (each can reach some target in bb3's domain). Statement costs
/// bias the SCC toward all-I. With SCC=all-I, the diagonal exit forces bb3
/// to match bb2=I, but bb3→bb4 only allows P→I, making bb3 infeasible for
/// both I (outgoing fails) and P (incoming fails). Rewind reaches the SCC,
/// `retry()` applies the next-ranked solution (all-P), and bb3=P succeeds.
#[test]
fn rewind_retries_cyclic_region() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0→bb1→bb2→bb1(loop)/bb2→bb3→bb4
    // bb0 trivial forced to I. {bb1,bb2} is 2-block SCC. bb3 and bb4 trivial.
    // The SCC exit bb2→bb3 is diagonal: the SCC solver sees both I and P as
    // feasible (each matches some target in bb3's domain {I,P}). But when
    // SCC=all-I, bb3 becomes infeasible:
    //   bb3=I: diagonal I→I ok, but bb3→bb4 I→I missing (only P→I) → infeasible.
    //   bb3=P: diagonal I→P missing → infeasible.
    // Rewind reaches the SCC; retry() picks all-P. With SCC=all-P:
    //   bb3=P: diagonal P→P ok, bb3→bb4 P→I ok → feasible.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            x = load 0;
            goto bb2();
        },
        bb2() {
            cond = load true;
            if cond then bb1() else bb3();
        },
        bb3() {
            x = load 0;
            goto bb4();
        },
        bb4() {
            return x;
        }
    });

    // bb4 forced to I.
    let domains = [
        target_set(&[I]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(1): I = 0, P = 1;
        bb(2): I = 0, P = 1
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb2→bb3 (arm0, else): diagonal — forces bb3 to match SCC target.
    //   SCC solver sees this as feasible for both I and P (each has a matching
    //   target in bb3's domain {I,P}).
    // bb2→bb1 (arm1, then): diagonal — forces bb1==bb2 within SCC.
    // bb3→bb4: only P→I — bb3=I is infeasible (I→I missing).
    terminators! { terminators;
        bb(0): [complete(0)];
        bb(1): [diagonal(0)];
        bb(2): [
            diagonal(0);
            diagonal(0)
        ];
        bb(3): [P->I = 0]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], I);
    assert_eq!(result[bb(1)], P);
    assert_eq!(result[bb(2)], P);
    assert_eq!(result[bb(3)], P);
    assert_eq!(result[bb(4)], I);
}

/// Verifies that rewind walks past an exhausted cyclic region to find an earlier alternative.
///
/// The SCC has single-target domains {P}, so `retry()` fails (no alternative
/// solutions, no perturbation possible). Rewind continues backward past the
/// SCC to bb0 which has an alternative target.
///
/// bb0 branches to both bb1 (SCC entry) and bb3 (join). bb3 has two
/// predecessors: bb0 (direct) and bb2 (SCC exit). The bb0→bb3 edge is
/// swap-only (I→P, P→I) and the bb2→bb3 edge only allows P→I. With bb0=I,
/// no target for bb3 satisfies both predecessors simultaneously.
#[test]
fn rewind_skips_exhausted_cyclic_region() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 branches: bb0→bb1(then), bb0→bb3(else).
    // bb1→bb2→bb1(loop), bb2→bb3(exit). bb3→bb4.
    // bb0 trivial {I,P}. {bb1,bb2} SCC, single-target {P}. bb3 trivial {I,P}.
    // bb4 trivial {I}.
    //
    // bb0→bb3 (arm0): swap only (I→P, P→I).
    // bb2→bb3 (SCC exit): P→I only.
    //
    // With bb0=I (cheaper stmt):
    //   SCC: all-P (forced). bb3 predecessors: bb0=I, bb2=P.
    //   bb3=I: bb0→bb3 I→I missing (swap). Infeasible.
    //   bb3=P: bb0→bb3 I→P ok. bb2→bb3 P→P missing (only P→I). Infeasible.
    //   bb3 heap empty → rewind.
    //   SCC: single-target {P}, retry() fails → skip.
    //   bb0: flip to P.
    // With bb0=P:
    //   SCC: all-P (forced). bb3 predecessors: bb0=P, bb2=P.
    //   bb3=I: bb0→bb3 P→I ok. bb2→bb3 P→I ok. bb3→bb4 I→I ok. Feasible!
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb3();
        },
        bb1() {
            x = load 0;
            goto bb2();
        },
        bb2() {
            cond = load true;
            if cond then bb1() else bb3();
        },
        bb3() {
            x = load 0;
            goto bb4();
        },
        bb4() {
            return x;
        }
    });

    let domains = [
        target_set(&[I, P]),
        target_set(&[P]),
        target_set(&[P]),
        target_set(&[I, P]),
        target_set(&[I]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(0): I = 0, P = 5
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0→bb3 (arm0, else): swap only — I→P, P→I.
    // bb0→bb1 (arm1, then): complete — permissive SCC entry.
    // SCC internal bb1→bb2: diagonal. bb2→bb1 (arm1, then): diagonal.
    // SCC exit bb2→bb3 (arm0, else): P→I only.
    // bb3→bb4: diagonal — same-target only.
    terminators! { terminators;
        bb(0): [
            I->P = 0, P->I = 0;
            complete(0)
        ];
        bb(1): [diagonal(0)];
        bb(2): [
            P->I = 0;
            diagonal(0)
        ];
        bb(3): [diagonal(0)]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], P);
    assert_eq!(result[bb(1)], P);
    assert_eq!(result[bb(2)], P);
    assert_eq!(result[bb(3)], I);
    assert_eq!(result[bb(4)], I);
}

/// Verifies that `run_forwards_loop` returns the failing block when no consistent assignment
/// exists.
///
/// The constraint system is unsatisfiable: diagonal-only edges force all blocks
/// to share a target, but a swap-only edge requires the join block to differ
/// from its predecessor. bb3 is the block where all candidates are exhausted.
#[test]
fn rewind_exhausts_all_regions() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Diamond: bb0→bb1(then), bb0→bb2(else), bb1→bb3, bb2→bb3. All trivial SCCs.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 0;
            goto bb3();
        },
        bb2() {
            x = load 0;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, ip, ip];

    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0); diagonal(0)];
        bb(1): [diagonal(0)];
        bb(2): [I->P = 0, P->I = 0]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);

    let mut regions = alloc::vec::Vec::new();
    solver
        .condensation
        .reverse_topological_order()
        .rev()
        .collect_into(&mut regions);
    assert_eq!(
        solver.run_forwards_loop(&body, &regions),
        Err(PlacementFailure::Block(bb(3)))
    );
}

/// Verifies that the forward pass rewinds when a cyclic region's CSP solver fails.
///
/// With bb0=I, the SCC has no feasible assignment because its only internal
/// transition requires P. Rewind flips bb0 to P, making the SCC solvable.
#[test]
fn forward_pass_rewinds_on_cyclic_failure() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0→bb1→bb2→bb1(loop)/bb2→bb3.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            x = load 0;
            goto bb2();
        },
        bb2() {
            cond = load true;
            if cond then bb1() else bb3();
        },
        bb3() {
            return x;
        }
    });

    let domains = [
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(0): I = 0, P = 5
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0→bb1 diagonal forces bb1==bb0. SCC internals only allow P.
    terminators! { terminators;
        bb(0): [diagonal(0)];
        bb(1): [P->P = 0];
        bb(2): [
            P->I = 0;
            P->P = 0
        ]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], P);
    assert_eq!(result[bb(1)], P);
    assert_eq!(result[bb(2)], P);
    assert_eq!(result[bb(3)], I);
}

/// Verifies that `adjust_cyclic` preserves the existing assignment when re-solving fails.
///
/// After the forward pass commits a valid SCC solution, a boundary target is
/// manually changed to make re-solving impossible. `adjust_cyclic` must detect
/// the failure and keep the original targets intact.
#[test]
fn backward_pass_keeps_assignment_when_csp_fails() {
    use core::mem;

    use super::estimate::HeapElement;

    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0→bb1→bb2→bb1(loop)/bb2→bb3→bb4.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            x = load 0;
            goto bb2();
        },
        bb2() {
            cond = load true;
            if cond then bb1() else bb3();
        },
        bb3() {
            x = load 0;
            goto bb4();
        },
        bb4() {
            return x;
        }
    });

    let domains = [
        target_set(&[I]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(1): I = 0, P = 10;
        bb(2): I = 0, P = 10
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // SCC internal diagonal. Exit bb2→bb3(arm0) only to I.
    terminators! { terminators;
        bb(0): [complete(0)];
        bb(1): [diagonal(0)];
        bb(2): [
            I->I = 0, P->I = 0;
            diagonal(0)
        ];
        bb(3): [complete(0)]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);

    let mut regions = alloc::vec::Vec::new();
    solver
        .condensation
        .reverse_topological_order()
        .rev()
        .collect_into(&mut regions);
    assert_eq!(solver.run_forwards_loop(&body, &regions), Ok(()));

    // Record forward-pass SCC assignment (should be all-I)
    let bb1_original = solver.targets[bb(1)].expect("bb1 assigned").target;
    let bb2_original = solver.targets[bb(2)].expect("bb2 assigned").target;
    assert_eq!(bb1_original, I);
    assert_eq!(bb2_original, I);

    // Mutate boundary: force bb3 to P (which breaks SCC re-solve since exit only allows *→I)
    solver.targets[bb(3)] = Some(HeapElement {
        target: P,
        cost: ApproxCost::ZERO,
    });

    // Extract cyclic region and call adjust_cyclic
    let scc_region_id = find_region_of(&solver, bb(1));
    let region = &mut solver.condensation[scc_region_id];
    let kind = mem::replace(&mut region.kind, PlacementRegionKind::Unassigned);
    let PlacementRegionKind::Cyclic(cyclic) = kind else {
        panic!("expected cyclic region for bb1");
    };
    let result_kind = solver.adjust_cyclic(&body, scc_region_id, cyclic);
    solver.condensation[scc_region_id].kind = result_kind;

    // Targets must be unchanged — adjust_cyclic kept the existing assignment
    assert_eq!(solver.targets[bb(1)].expect("bb1 assigned").target, I);
    assert_eq!(solver.targets[bb(2)].expect("bb2 assigned").target, I);
}

/// Verifies that the backward pass adopts a cheaper SCC solution when boundary context improves.
///
/// The forward pass picks all-P for the SCC (cheapest statements with unassigned
/// successor). After the backward pass assigns the successor to I, re-solving
/// finds all-I is cheaper (avoids the P→I boundary penalty) and adopts it.
#[test]
fn backward_pass_adopts_better_cyclic_solution() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0→bb1→bb2→bb1(loop)/bb2→bb3→bb4.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            x = load 0;
            goto bb2();
        },
        bb2() {
            cond = load true;
            if cond then bb1() else bb3();
        },
        bb3() {
            x = load 0;
            goto bb4();
        },
        bb4() {
            return x;
        }
    });

    let domains = [
        target_set(&[I]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I]),
    ];

    // SCC stmts: P much cheaper → forward picks all-P.
    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(1): I = 10, P = 0;
        bb(2): I = 10, P = 0
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [complete(0)];
        bb(1): [diagonal(0)];
        bb(2): [
            I->I = 0, P->P = 0, I->P = 100, P->I = 100;
            diagonal(0)
        ];
        bb(3): [I->I = 0]
    }

    let result = run_solver(&body, &env, &interner, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], I);
    assert_eq!(result[bb(1)], I);
    assert_eq!(result[bb(2)], I);
    assert_eq!(result[bb(3)], I);
    assert_eq!(result[bb(4)], I);
}

/// Verifies that `run` emits an unsatisfiable placement diagnostic when a trivial region
/// exhausts all candidates and rewind finds no alternatives.
///
/// Uses the same unsatisfiable diamond CFG as [`rewind_exhausts_all_regions`] but calls
/// `solver.run` instead of `run_forwards_loop`, then inspects `context.diagnostics`.
#[test]
fn trivial_failure_emits_diagnostic() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Diamond: bb0→bb1(then), bb0→bb2(else), bb1→bb3, bb2→bb3. All trivial SCCs.
    // bb1→bb3: diagonal only. bb2→bb3: swap only (I→P, P→I).
    // No assignment for bb3 satisfies both predecessors simultaneously, and
    // rewind exhausts all alternatives.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 0;
            goto bb3();
        },
        bb2() {
            x = load 0;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, ip, ip];

    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [diagonal(0); diagonal(0)];
        bb(1): [diagonal(0)];
        bb(2): [I->P = 0, P->I = 0]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let mut context = MirContext::new(&env, &interner);

    let _result = solver.run(&mut context, &body);

    assert_eq!(context.diagnostics.len(), 1);
    let diagnostic = context.diagnostics.iter().next().expect("one diagnostic");
    assert_eq!(diagnostic.severity, Severity::Bug);
    assert_eq!(
        diagnostic.category,
        MirDiagnosticCategory::Placement(PlacementDiagnosticCategory::UnsatisfiablePlacement),
    );
}

/// Verifies that `run` emits an unsatisfiable placement diagnostic when a cyclic region
/// has no consistent assignment and there are no earlier regions to rewind to.
///
/// The SCC {bb0, bb1} has mutually contradictory transition constraints: bb0→bb1
/// requires (bb0=I, bb1=P) while bb1→bb0 requires (bb1=I, bb0=P). AC-3 detects
/// domain wipeout immediately. Since the SCC is the first region in topological
/// order, rewind has nowhere to go.
#[test]
fn cyclic_failure_emits_diagnostic() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 branches to bb1(then) and bb2(else). bb1→bb0 closes the cycle.
    // bb2 is the exit. SCC = {bb0, bb1}, processed first.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, x: Int;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb0();
        },
        bb2() {
            x = load 0;
            return x;
        }
    });

    let ip = target_set(&[I, P]);
    let domains = [ip, ip, ip];

    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb0→bb1 (arm1, then): only I→P — forces bb0=I, bb1=P.
    // bb1→bb0 (arm0, goto): only I→P — forces bb1=I, bb0=P.
    // Contradiction: bb1 must be both P and I. AC-3 wipes the domain.
    // bb0→bb2 (arm0, else): permissive, irrelevant to the SCC.
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [
            complete(0);
            I->P = 0
        ];
        bb(1): [I->P = 0]
    }

    let assignment = BasicBlockSlice::from_raw(&domains);
    let data = PlacementSolverContext {
        assignment,
        statements: &statements,
        terminators: &terminators,
    };
    let mut solver = data.build_in(&body, &heap);
    let mut context = MirContext::new(&env, &interner);

    let _result = solver.run(&mut context, &body);

    assert_eq!(context.diagnostics.len(), 1);
    let diagnostic = context.diagnostics.iter().next().expect("one diagnostic");
    assert_eq!(diagnostic.severity, Severity::Bug);
    assert_eq!(
        diagnostic.category,
        MirDiagnosticCategory::Placement(PlacementDiagnosticCategory::UnsatisfiablePlacement),
    );
}
