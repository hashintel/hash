//! Tests for basic block fusion.
#![expect(clippy::min_ident_chars)]

use core::assert_matches;
use std::{io::Write as _, path::PathBuf};

use hashql_core::{
    heap::Heap,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{BasicBlockFusion, fusable_into};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockVec},
        terminator::TerminatorKind,
    },
    builder::body,
    context::MirContext,
    intern::Interner,
    pass::execution::target::TargetId,
    pretty::TextFormatOptions,
};

// =============================================================================
// Test Helpers
// =============================================================================

fn make_targets<'heap>(
    heap: &'heap Heap,
    assignments: &[TargetId],
) -> BasicBlockVec<TargetId, &'heap Heap> {
    let mut targets = BasicBlockVec::with_capacity_in(assignments.len(), heap);
    for &target in assignments {
        targets.push(target);
    }
    targets
}

#[track_caller]
fn assert_fusion<'heap>(
    name: &'static str,
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    targets: &BasicBlockVec<TargetId, &'heap Heap>,
) {
    let formatter = Formatter::new(context.heap);
    let type_formatter = TypeFormatter::new(&formatter, context.env, TypeFormatterOptions::terse());

    let mut text_format = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: type_formatter,
        annotations: (),
    }
    .build();

    text_format.format_body(body).expect("formatting failed");

    write!(text_format.writer, "\n\n{:=^50}\n\n", " Block Targets ").expect("infallible");

    for (index, target) in targets.iter_enumerated() {
        writeln!(text_format.writer, "{index}: {target}").expect("infallible");
    }

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/execution/fusion"));
    settings.set_prepend_module_to_snapshot(false);

    let _guard = settings.bind_to_scope();

    let output = String::from_utf8_lossy(&text_format.writer);
    assert_snapshot!(name, output);
}

// =============================================================================
// fusable_into() Tests
// =============================================================================

#[test]
fn fusable_into_same_target_goto() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            y = load 2;
            return y;
        }
    });

    let targets = make_targets(&heap, &[TargetId::Interpreter, TargetId::Interpreter]);

    let result = fusable_into(&body, &targets, BasicBlockId::new(1));
    assert_eq!(result, Some(BasicBlockId::new(0)));
}

#[test]
fn fusable_into_different_targets() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            y = load 2;
            return y;
        }
    });

    let targets = make_targets(&heap, &[TargetId::Interpreter, TargetId::Postgres]);

    let result = fusable_into(&body, &targets, BasicBlockId::new(1));
    assert_eq!(result, None);
}

#[test]
fn fusable_into_multiple_predecessors() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 1;
            goto bb3();
        },
        bb2() {
            x = load 2;
            goto bb3();
        },
        bb3() {
            return x;
        }
    });

    let targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
        ],
    );

    // bb3 has two predecessors — not fusable
    let result = fusable_into(&body, &targets, BasicBlockId::new(3));
    assert_eq!(result, None);
}

// =============================================================================
// Fusion integration tests (snapshot)
// =============================================================================

#[test]
fn fuse_no_changes_needed() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut targets = make_targets(&heap, &[TargetId::Interpreter]);

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    assert_eq!(body.basic_blocks.len(), 1);
    assert_eq!(targets.len(), 1);
    assert_fusion("fuse_no_changes_needed", &context, &body, &targets);
}

#[test]
fn fuse_two_same_target_blocks() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            y = load 2;
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut targets = make_targets(&heap, &[TargetId::Interpreter, TargetId::Interpreter]);

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    assert_eq!(body.basic_blocks.len(), 1);
    assert_eq!(targets.len(), 1);
    assert_eq!(targets[BasicBlockId::START], TargetId::Interpreter);
    assert_matches!(
        body.basic_blocks[BasicBlockId::START].terminator.kind,
        TerminatorKind::Return(_)
    );
    assert_fusion("fuse_two_same_target_blocks", &context, &body, &targets);
}

#[test]
fn fuse_chain_of_three() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            y = load 2;
            goto bb2();
        },
        bb2() {
            z = load 3;
            return z;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut targets = make_targets(
        &heap,
        &[TargetId::Postgres, TargetId::Postgres, TargetId::Postgres],
    );

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    assert_eq!(body.basic_blocks.len(), 1);
    assert_eq!(targets.len(), 1);
    assert_eq!(targets[BasicBlockId::START], TargetId::Postgres);
    assert_eq!(body.basic_blocks[BasicBlockId::START].statements.len(), 3);
    assert_fusion("fuse_chain_of_three", &context, &body, &targets);
}

#[test]
fn fuse_preserves_different_targets() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            y = load 2;
            goto bb2();
        },
        bb2() {
            z = load 3;
            return z;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // bb0 and bb1 are Interpreter, bb2 is Postgres — bb2 cannot fuse into bb1
    let mut targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Postgres,
        ],
    );

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    assert_eq!(body.basic_blocks.len(), 2);
    assert_eq!(targets.len(), 2);
    assert_eq!(targets[BasicBlockId::new(0)], TargetId::Interpreter);
    assert_eq!(targets[BasicBlockId::new(1)], TargetId::Postgres);
    assert_fusion(
        "fuse_preserves_different_targets",
        &context,
        &body,
        &targets,
    );
}

#[test]
fn fuse_partial_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, b: Int, c: Int, d: Int;

        bb0() {
            a = load 1;
            goto bb1();
        },
        bb1() {
            b = load 2;
            goto bb2();
        },
        bb2() {
            c = load 3;
            goto bb3();
        },
        bb3() {
            d = load 4;
            return d;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // bb0-bb1 are Interpreter, bb2-bb3 are Postgres
    let mut targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Postgres,
            TargetId::Postgres,
        ],
    );

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    assert_eq!(body.basic_blocks.len(), 2);
    assert_eq!(targets.len(), 2);
    assert_eq!(targets[BasicBlockId::new(0)], TargetId::Interpreter);
    assert_eq!(targets[BasicBlockId::new(1)], TargetId::Postgres);
    assert_eq!(body.basic_blocks[BasicBlockId::new(0)].statements.len(), 2);
    assert_eq!(body.basic_blocks[BasicBlockId::new(1)].statements.len(), 2);
    assert_fusion("fuse_partial_chain", &context, &body, &targets);
}

#[test]
fn fuse_updates_branch_references() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int, cond: Bool;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1() {
            cond = load true;
            if cond then bb2() else bb3();
        },
        bb2() {
            y = load 2;
            return y;
        },
        bb3() {
            z = load 3;
            return z;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // bb0 and bb1 same target — fusable. bb2 and bb3 are leaves.
    let mut targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
        ],
    );

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    assert_eq!(body.basic_blocks.len(), 3);
    assert_eq!(targets.len(), 3);

    // The fused bb0 should have a SwitchInt terminator pointing to remapped bb2→bb1 and bb3→bb2
    let fused = &body.basic_blocks[BasicBlockId::START];
    assert_matches!(fused.terminator.kind, TerminatorKind::SwitchInt(_));
    assert_fusion("fuse_updates_branch_references", &context, &body, &targets);
}

#[test]
fn fuse_does_not_fuse_join_points() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int, cond: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 1;
            goto bb3();
        },
        bb2() {
            y = load 2;
            goto bb3();
        },
        bb3() {
            z = load 3;
            return z;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // All same target, but bb3 has 2 predecessors — not fusable
    let mut targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
        ],
    );

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    assert_eq!(body.basic_blocks.len(), 4);
    assert_eq!(targets.len(), 4);
    assert_fusion("fuse_does_not_fuse_join_points", &context, &body, &targets);
}

// =============================================================================
// Regression tests for bugs fixed during implementation
// =============================================================================

#[test]
fn fusable_into_goto_with_args() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1(x);
        },
        bb1(y) {
            return y;
        }
    });

    let targets = make_targets(&heap, &[TargetId::Interpreter, TargetId::Interpreter]);

    // The Goto carries an argument — not fusable even though targets match.
    let result = fusable_into(&body, &targets, BasicBlockId::new(1));
    assert_eq!(result, None);
}

#[test]
fn fusable_into_target_has_params() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // A goto with no arguments to a block that nonetheless has a parameter. This is a
    // malformed edge (arity mismatch), but fusable_into must still reject it because the
    // block has parameters that cannot be resolved by simple statement concatenation.
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1();
        },
        bb1(y) {
            return y;
        }
    });

    let targets = make_targets(&heap, &[TargetId::Interpreter, TargetId::Interpreter]);

    let result = fusable_into(&body, &targets, BasicBlockId::new(1));
    assert_eq!(result, None);
}

#[test]
fn fuse_goto_with_args_not_fused() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            goto bb1(x);
        },
        bb1(y) {
            return y;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut targets = make_targets(&heap, &[TargetId::Interpreter, TargetId::Interpreter]);

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    // Both blocks survive because the Goto carries arguments.
    assert_eq!(body.basic_blocks.len(), 2);
    assert_eq!(targets.len(), 2);
    assert_fusion("fuse_goto_with_args_not_fused", &context, &body, &targets);
}

#[test]
fn fuse_diamond_non_monotonic_rpo() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Diamond CFG where the "else" branch (bb1) has a lower numeric ID than the "then"
    // branch (bb2). Each arm has a fusable successor, creating gaps in the ID space that
    // compaction must close. RPO visits the then-arm (bb2→bb3) before the else-arm
    // (bb1→bb4), so among surviving blocks the RPO order is bb0, bb2, bb1, bb5 — which is
    // non-monotonic relative to numeric IDs (bb0, bb1, bb2, bb5). The old naive swap-based
    // compaction iterated in RPO order and would have displaced live blocks.
    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, a: Int, b: Int, c: Int, d: Int, result: Int;

        bb0() {
            cond = load true;
            if cond then bb2() else bb1();
        },
        bb1() {
            a = load 10;
            goto bb4();
        },
        bb2() {
            b = load 20;
            goto bb3();
        },
        bb3() {
            c = load 30;
            goto bb5();
        },
        bb4() {
            d = load 40;
            goto bb5();
        },
        bb5() {
            result = load 99;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // bb2 and bb3 same target (bb3 fuses into bb2), bb1 and bb4 same target (bb4 fuses
    // into bb1). bb5 has two predecessors — not fusable.
    let mut targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Postgres,
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Postgres,
            TargetId::Interpreter,
        ],
    );

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    // Surviving: bb0(→0), bb1(→1), bb2(→2), bb5(→3)
    assert_eq!(body.basic_blocks.len(), 4);
    assert_eq!(targets.len(), 4);
    assert_eq!(targets[BasicBlockId::new(0)], TargetId::Interpreter);
    assert_eq!(targets[BasicBlockId::new(1)], TargetId::Postgres);
    assert_eq!(targets[BasicBlockId::new(2)], TargetId::Interpreter);
    assert_eq!(targets[BasicBlockId::new(3)], TargetId::Interpreter);

    // bb1 absorbed bb4's statements.
    assert_eq!(body.basic_blocks[BasicBlockId::new(1)].statements.len(), 2);
    // bb2 absorbed bb3's statements.
    assert_eq!(body.basic_blocks[BasicBlockId::new(2)].statements.len(), 2);

    assert_fusion("fuse_diamond_non_monotonic_rpo", &context, &body, &targets);
}

#[test]
fn fuse_backward_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // bb0 branches to bb2 and bb3. bb2 gotos bb1, so bb1 (id=1) fuses into bb2 (id=2).
    // This means head[bb1] = bb2 = 2 > 1 = bb1 — the head has a HIGHER numeric ID than
    // the block it absorbs. A single-pass remap that reads `remap[head[block_id]]` for
    // non-heads in numeric order would read remap[2] before it was assigned.
    let mut body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, a: Int, b: Int;

        bb0() {
            cond = load true;
            if cond then bb2() else bb3();
        },
        bb1() {
            return a;
        },
        bb2() {
            a = load 42;
            goto bb1();
        },
        bb3() {
            b = load 99;
            return b;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut targets = make_targets(
        &heap,
        &[
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
            TargetId::Interpreter,
        ],
    );

    BasicBlockFusion::new().fuse(&mut body, &mut targets);

    // Surviving: bb0(→0), bb2(→1), bb3(→2). bb1 fused into bb2.
    assert_eq!(body.basic_blocks.len(), 3);
    assert_eq!(targets.len(), 3);

    // bb2 absorbed bb1's return terminator.
    assert_matches!(
        body.basic_blocks[BasicBlockId::new(1)].terminator.kind,
        TerminatorKind::Return(_)
    );

    // bb0's branch targets must point to the remapped IDs (bb2→1, bb3→2).
    assert_matches!(
        body.basic_blocks[BasicBlockId::START].terminator.kind,
        TerminatorKind::SwitchInt(_)
    );

    assert_fusion("fuse_backward_chain", &context, &body, &targets);
}
