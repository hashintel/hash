#![expect(clippy::min_ident_chars)]

use hashql_core::{
    heap::Heap,
    id::{IdArray, bit_vec::FiniteBitSet},
    r#type::environment::Environment,
};

use super::PlacementContext;
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
        location::Location,
    },
    builder::body,
    intern::Interner,
    pass::execution::{
        StatementCostVec,
        target::{TargetArray, TargetBitSet, TargetId},
        terminator_placement::{TerminatorCostVec, TransMatrix},
    },
};

pub(crate) fn target_set(targets: &[TargetId]) -> TargetBitSet {
    let mut set = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT as u32);
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

pub(crate) fn full_matrix() -> TransMatrix {
    let mut matrix = TransMatrix::new();
    for source in TargetId::all() {
        for dest in TargetId::all() {
            matrix.insert(source, dest, cost!(1));
        }
    }
    matrix
}

pub(crate) fn same_target_matrix() -> TransMatrix {
    let mut matrix = TransMatrix::new();
    for target in TargetId::all() {
        matrix.insert(target, target, cost!(0));
    }
    matrix
}

pub(crate) fn run_solver<'heap>(
    body: &Body<'heap>,
    heap: &'heap Heap,
    domains: &[TargetBitSet],
    statements: &TargetArray<StatementCostVec<&'heap Heap>>,
    terminators: &TerminatorCostVec<&'heap Heap>,
) -> BasicBlockVec<TargetId, &'heap Heap> {
    let assignment = BasicBlockSlice::from_raw(domains);
    let data = PlacementContext {
        assignment,
        statements,
        terminators,
    };
    let mut solver = data.run_in(body, heap);
    solver.run(body)
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

    let ip = target_set(&[TargetId::Interpreter, TargetId::Postgres]);
    let domains = [ip, ip, ip, ip];

    let statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    // bb0 → bb1 (arm 0), bb0 → bb2 (arm 1)
    let bb0_edges = terminators.of_mut(bb(0));
    bb0_edges[0] = full_matrix();
    bb0_edges[1] = full_matrix();
    // bb1 → bb3
    terminators.of_mut(bb(1))[0] = full_matrix();
    // bb2 → bb3
    terminators.of_mut(bb(2))[0] = full_matrix();

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    for block_id in 0..4_u32 {
        let target = result[bb(block_id)];
        assert!(
            target == TargetId::Interpreter || target == TargetId::Postgres,
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

    let domains = [
        target_set(&[TargetId::Interpreter]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb1 statement costs: Interpreter=10, Postgres=2
    statements[TargetId::Interpreter][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(10));
    statements[TargetId::Postgres][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(2));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0 → bb1: I→I=0, I→P=0
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
        matrix.insert(TargetId::Interpreter, TargetId::Postgres, cost!(0));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    // bb1 → bb2: I→I=0, P→I=50
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
        matrix.insert(TargetId::Postgres, TargetId::Interpreter, cost!(50));
        terminators.of_mut(bb(1))[0] = matrix;
    }

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    // Forward: bb0=I (forced). bb1 picks P (stmt cost 2 < 10). bb2=I (forced).
    // Backward: bb1 reconsiders with bb2=I known. P cost = 2+50=52 vs I cost = 10+0=10.
    // Switches to I.
    assert_eq!(result[bb(0)], TargetId::Interpreter);
    assert_eq!(result[bb(1)], TargetId::Interpreter);
    assert_eq!(result[bb(2)], TargetId::Interpreter);
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

    let domains = [
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Postgres]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb0: I=1, P=5 → prefer I
    statements[TargetId::Interpreter][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(1));
    statements[TargetId::Postgres][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(5));

    // bb1: I=5, P=1 → prefer P initially
    statements[TargetId::Interpreter][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(5));
    statements[TargetId::Postgres][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(1));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0 → bb1: all transitions allowed at cost 0
    terminators.of_mut(bb(0))[0] = full_matrix();
    // bb1 → bb2: only I→P allowed (P→P disallowed)
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(TargetId::Interpreter, TargetId::Postgres, cost!(0));
        terminators.of_mut(bb(1))[0] = matrix;
    }

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    // bb1 must be I (only I→P exists to reach bb2=P)
    assert_eq!(result[bb(1)], TargetId::Interpreter);
    assert_eq!(result[bb(2)], TargetId::Postgres);
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
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Postgres]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // Make P cheaper so initial picks are P
    for block_idx in 0..3_u32 {
        statements[TargetId::Interpreter][Location {
            block: bb(block_idx),
            statement_index: 1,
        }] = Some(cost!(5));
        statements[TargetId::Postgres][Location {
            block: bb(block_idx),
            statement_index: 1,
        }] = Some(cost!(1));
    }

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0 → bb1: all allowed
    terminators.of_mut(bb(0))[0] = full_matrix();
    // bb1 → bb2: all allowed
    terminators.of_mut(bb(1))[0] = full_matrix();
    // bb2 → bb3: only I→P allowed (P→P disallowed)
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(TargetId::Interpreter, TargetId::Postgres, cost!(0));
        terminators.of_mut(bb(2))[0] = matrix;
    }

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    // bb2 must switch to I (only I→P reaches bb3=P), bb3=P
    assert_eq!(result[bb(2)], TargetId::Interpreter);
    assert_eq!(result[bb(3)], TargetId::Postgres);
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

    let domains = [target_set(&[TargetId::Interpreter, TargetId::Postgres])];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // I=10, P=5 → P is cheaper
    statements[TargetId::Interpreter][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(10));
    statements[TargetId::Postgres][Location {
        block: bb(0),
        statement_index: 1,
    }] = Some(cost!(5));

    let terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], TargetId::Postgres);
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
        target_set(&[TargetId::Interpreter]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        target_set(&[TargetId::Interpreter]),
    ];

    let mut statements: TargetArray<StatementCostVec<&Heap>> =
        IdArray::from_fn(|_: TargetId| StatementCostVec::new(&body.basic_blocks, &heap));

    // bb1: I=3, P=1; bb2: I=3, P=1
    statements[TargetId::Interpreter][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(3));
    statements[TargetId::Postgres][Location {
        block: bb(1),
        statement_index: 1,
    }] = Some(cost!(1));
    statements[TargetId::Interpreter][Location {
        block: bb(2),
        statement_index: 1,
    }] = Some(cost!(3));
    statements[TargetId::Postgres][Location {
        block: bb(2),
        statement_index: 1,
    }] = Some(cost!(1));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    // bb0 → bb1: I→I=0, I→P=5
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
        matrix.insert(TargetId::Interpreter, TargetId::Postgres, cost!(5));
        terminators.of_mut(bb(0))[0] = matrix;
    }
    // bb1 → bb2: I→I=0, P→P=0, I→P=5, P→I=5
    {
        let mut matrix = TransMatrix::new();
        matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
        matrix.insert(TargetId::Postgres, TargetId::Postgres, cost!(0));
        matrix.insert(TargetId::Interpreter, TargetId::Postgres, cost!(5));
        matrix.insert(TargetId::Postgres, TargetId::Interpreter, cost!(5));
        terminators.of_mut(bb(1))[0] = matrix;
    }
    // bb2 → bb1 (arm 0), bb2 → bb3 (arm 1)
    {
        let mut back_matrix = TransMatrix::new();
        back_matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
        back_matrix.insert(TargetId::Postgres, TargetId::Postgres, cost!(0));
        back_matrix.insert(TargetId::Interpreter, TargetId::Postgres, cost!(5));
        back_matrix.insert(TargetId::Postgres, TargetId::Interpreter, cost!(5));

        let mut exit_matrix = TransMatrix::new();
        exit_matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
        exit_matrix.insert(TargetId::Postgres, TargetId::Interpreter, cost!(5));

        let bb2_edges = terminators.of_mut(bb(2));
        bb2_edges[0] = back_matrix;
        bb2_edges[1] = exit_matrix;
    }

    let result = run_solver(&body, &heap, &domains, &statements, &terminators);

    assert_eq!(result[bb(0)], TargetId::Interpreter);
    assert_eq!(result[bb(3)], TargetId::Interpreter);
    // SCC {bb1, bb2}: all-I = stmt 6 + boundary 0 = 6
    //                  all-P = stmt 2 + boundary(I→P=5 + P→I=5) = 12
    // Solver should pick I for both
    assert_eq!(result[bb(1)], TargetId::Interpreter);
    assert_eq!(result[bb(2)], TargetId::Interpreter);
}
