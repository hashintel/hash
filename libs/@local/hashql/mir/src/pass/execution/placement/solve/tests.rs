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

#[test]
fn backward_pass_improves_suboptimal_forward() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

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

    let domains = [target_set(&[I]), target_set(&[I, P]), target_set(&[I])];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(1): I = 10, P = 2
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [I->I = 0, I->P = 0];
        bb(1): [I->I = 0, P->I = 50]
    }

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    // Forward: bb0=I (forced). bb1 picks P (stmt cost 2 < 10). bb2=I (forced).
    // Backward: bb1 reconsiders with bb2=I known. P cost = 2+50=52 vs I cost = 10+0=10.
    // Switches to I.
    assert_eq!(result[bb(0)], I);
    assert_eq!(result[bb(1)], I);
    assert_eq!(result[bb(2)], I);
}

#[test]
fn rewind_backtracks_across_trivial_regions() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

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

    let domains = [target_set(&[I, P]), target_set(&[I, P]), target_set(&[P])];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(0): I = 1, P = 5;
        bb(1): I = 5, P = 1
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [complete(1)];
        bb(1): [I->P = 0]
    }

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    // bb1 must be I (only I→P exists to reach bb2=P)
    assert_eq!(result[bb(1)], I);
    assert_eq!(result[bb(2)], P);
}

#[test]
fn rewind_clears_downstream_assignments() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

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
            x = load 0;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    let domains = [
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[I, P]),
        target_set(&[P]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    stmt_costs! { statements;
        bb(0): I = 5, P = 1;
        bb(1): I = 5, P = 1;
        bb(2): I = 5, P = 1
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators! { terminators;
        bb(0): [complete(1)];
        bb(1): [complete(1)];
        bb(2): [I->P = 0]
    }

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    // bb2 must switch to I (only I→P reaches bb3=P), bb3=P
    assert_eq!(result[bb(2)], I);
    assert_eq!(result[bb(3)], P);
}

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
    // SCC {bb1, bb2}: all-I = stmt 6 + boundary 0 = 6
    //                  all-P = stmt 2 + boundary(I→P=5 + P→I=5) = 12
    // Solver should pick I for both
    assert_eq!(result[bb(1)], I);
    assert_eq!(result[bb(2)], I);
}
