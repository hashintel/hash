//! Tests for AC-3 arc consistency pruning.
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;

use hashql_core::{heap::Heap, id::bit_vec::FiniteBitSet, r#type::environment::Environment};

use super::ArcConsistency;
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
    },
    builder::body,
    intern::Interner,
    pass::execution::{
        target::{TargetBitSet, TargetId},
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

fn all_targets() -> TargetBitSet {
    target_set(&[
        TargetId::Interpreter,
        TargetId::Postgres,
        TargetId::Embedding,
    ])
}

fn bb(index: u32) -> BasicBlockId {
    BasicBlockId::new(index)
}

fn run_ac3<'heap>(
    body: &Body<'heap>,
    domains: &mut [TargetBitSet],
    terminators: &mut TerminatorCostVec<&'heap Heap>,
) {
    let mut arc = ArcConsistency {
        blocks: BasicBlockSlice::from_raw_mut(domains),
        terminators,
    };

    arc.run_in(body, Global);
}

fn full_matrix() -> TransMatrix {
    let mut matrix = TransMatrix::new();
    for source in TargetId::all() {
        for dest in TargetId::all() {
            matrix.insert(source, dest, cost!(1));
        }
    }
    matrix
}

#[test]
fn already_consistent_no_pruning() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            x = load 0;
            return x;
        }
    });

    let mut domains = [all_targets(), all_targets()];
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = full_matrix();

    let before = domains.clone();
    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(domains, before);
}

#[test]
fn source_side_pruning() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            x = load 0;
            return x;
        }
    });

    let mut domains = [all_targets(), target_set(&[TargetId::Interpreter])];

    let mut matrix = TransMatrix::new();
    matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = matrix;

    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(domains[0], target_set(&[TargetId::Interpreter]));
    assert_eq!(domains[1], target_set(&[TargetId::Interpreter]));
}

#[test]
fn target_side_pruning() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            x = load 0;
            return x;
        }
    });

    let mut domains = [
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
        all_targets(),
    ];

    let mut matrix = TransMatrix::new();
    matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
    matrix.insert(TargetId::Postgres, TargetId::Postgres, cost!(0));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = matrix;

    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(
        domains[0],
        target_set(&[TargetId::Interpreter, TargetId::Postgres])
    );
    assert_eq!(
        domains[1],
        target_set(&[TargetId::Interpreter, TargetId::Postgres])
    );
}

#[test]
fn mutual_pruning_both_sides() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            x = load 0;
            return x;
        }
    });

    let mut domains = [
        target_set(&[TargetId::Interpreter, TargetId::Embedding]),
        target_set(&[TargetId::Interpreter, TargetId::Postgres]),
    ];

    let mut matrix = TransMatrix::new();
    matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = matrix;

    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(domains[0], target_set(&[TargetId::Interpreter]));
    assert_eq!(domains[1], target_set(&[TargetId::Interpreter]));
}

#[test]
fn diamond_cfg_pruning() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 → bb1, bb0 → bb2 (via switch)
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Int;

        bb0() {
            cond = load 0;
            switch cond [0 => bb1(), _ => bb2()];
        },
        bb1() {
            return 0;
        },
        bb2() {
            return 1;
        }
    });

    let mut domains = [
        target_set(&[TargetId::Interpreter]),
        all_targets(),
        all_targets(),
    ];

    let mut m_interp = TransMatrix::new();
    m_interp.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    let matrices = terminators.of_mut(bb(0));
    matrices[0] = m_interp;
    matrices[1] = m_interp;

    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(domains[0], target_set(&[TargetId::Interpreter]));
    assert_eq!(domains[1], target_set(&[TargetId::Interpreter]));
    assert_eq!(domains[2], target_set(&[TargetId::Interpreter]));
}

#[test]
fn self_loop_pruning() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 → bb0 (self-loop via goto)
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 0;
            goto bb0();
        }
    });

    let mut domains = [all_targets()];

    let mut matrix = TransMatrix::new();
    matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
    matrix.insert(TargetId::Postgres, TargetId::Postgres, cost!(0));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = matrix;

    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(
        domains[0],
        target_set(&[TargetId::Interpreter, TargetId::Postgres])
    );
}

#[test]
fn bidirectional_edges_require_joint_support() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 ↔ bb1 (two edges, both directions)
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            x = load 0;
            goto bb0();
        }
    });

    let mut domains = [all_targets(), all_targets()];

    let mut forward = TransMatrix::new();
    forward.insert(TargetId::Interpreter, TargetId::Postgres, cost!(0));
    forward.insert(TargetId::Postgres, TargetId::Postgres, cost!(0));

    let mut reverse = TransMatrix::new();
    reverse.insert(TargetId::Postgres, TargetId::Postgres, cost!(0));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = forward;
    terminators.of_mut(bb(1))[0] = reverse;

    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(domains[0], target_set(&[TargetId::Postgres]));
    assert_eq!(domains[1], target_set(&[TargetId::Postgres]));
}

#[test]
fn matrix_pruned_after_ac3() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1();
        },
        bb1() {
            x = load 0;
            return x;
        }
    });

    let mut domains = [target_set(&[TargetId::Interpreter]), all_targets()];

    let mut matrix = TransMatrix::new();
    matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
    matrix.insert(TargetId::Postgres, TargetId::Interpreter, cost!(10));
    matrix.insert(TargetId::Embedding, TargetId::Interpreter, cost!(20));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    terminators.of_mut(bb(0))[0] = matrix;

    run_ac3(&body, &mut domains, &mut terminators);

    let pruned = terminators.of(bb(0))[0];
    assert_eq!(
        pruned.get(TargetId::Interpreter, TargetId::Interpreter),
        Some(cost!(0))
    );
    assert_eq!(pruned.get(TargetId::Postgres, TargetId::Interpreter), None);
    assert_eq!(pruned.get(TargetId::Embedding, TargetId::Interpreter), None);
}

#[test]
fn single_block_no_edges() {
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

    let mut domains = [all_targets()];
    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);

    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(domains[0], all_targets());
}

#[test]
fn switchint_multiple_edges_to_same_block() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Both switch arms go to bb1
    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Int;

        bb0() {
            cond = load 0;
            switch cond [0 => bb1(), _ => bb1()];
        },
        bb1() {
            return 0;
        }
    });

    let mut domains = [all_targets(), all_targets()];

    let mut m0 = TransMatrix::new();
    m0.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
    m0.insert(TargetId::Postgres, TargetId::Postgres, cost!(0));

    let mut m1 = TransMatrix::new();
    m1.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));

    let mut terminators = TerminatorCostVec::new(&body.basic_blocks, &heap);
    let matrices = terminators.of_mut(bb(0));
    matrices[0] = m0;
    matrices[1] = m1;

    run_ac3(&body, &mut domains, &mut terminators);

    assert_eq!(domains[0], target_set(&[TargetId::Interpreter]));
    assert_eq!(domains[1], target_set(&[TargetId::Interpreter]));
}
