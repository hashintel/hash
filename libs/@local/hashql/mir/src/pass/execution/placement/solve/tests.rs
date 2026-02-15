#![expect(clippy::min_ident_chars)]

use core::alloc::Allocator;

use hashql_core::{
    heap::{BumpAllocator, Heap},
    id::{IdArray, bit_vec::FiniteBitSet},
    r#type::environment::Environment,
};

use super::{
    PlacementRegionId, PlacementSolver, PlacementSolverContext, condensation::PlacementRegionKind,
    csp::ConstraintSatisfaction,
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
        location::Location,
    },
    builder::body,
    intern::Interner,
    pass::execution::{
        ApproxCost, Cost, StatementCostVec,
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
    heap: &'heap Heap,
    domains: &[TargetBitSet],
    statements: &TargetArray<StatementCostVec<&'heap Heap>>,
    terminators: &TerminatorCostVec<&'heap Heap>,
) -> BasicBlockVec<TargetId, &'heap Heap> {
    let assignment = BasicBlockSlice::from_raw(domains);
    let data = PlacementSolverContext {
        assignment,
        statements,
        terminators,
    };
    let mut solver = data.build_in(body, heap);
    solver.run(body)
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

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

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

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

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

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

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

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

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

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

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

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], I);
    assert_eq!(result[bb(3)], I);
    // SCC {bb1, bb2}: all-I feasible (stmt 6 + boundary 0 = 6).
    // all-P infeasible: bb2→bb1 backedge (arm1) lacks P→P transition.
    // Solver picks I for both.
    assert_eq!(result[bb(1)], I);
    assert_eq!(result[bb(2)], I);
}
