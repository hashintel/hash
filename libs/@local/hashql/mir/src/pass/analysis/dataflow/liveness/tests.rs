#![expect(clippy::min_ident_chars, reason = "tests")]

use core::fmt::{self, Display};
use std::path::PathBuf;

use hashql_core::{
    heap::Heap,
    id::bit_vec::DenseBitSet,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use insta::{Settings, assert_snapshot};

use super::LivenessAnalysis;
use crate::{
    body::{Body, basic_block::BasicBlockId, local::Local},
    builder::body,
    intern::Interner,
    pass::analysis::dataflow::framework::{DataflowAnalysis as _, DataflowResults, Direction},
    pretty::TextFormat,
};

fn format_liveness_state(mut write: impl fmt::Write, state: &DenseBitSet<Local>) -> fmt::Result {
    for (index, local) in state.iter().enumerate() {
        if index > 0 {
            write!(write, ", ")?;
        }

        write!(write, "{local}")?;
    }

    Ok(())
}

fn format_liveness_result(
    mut write: impl fmt::Write,
    bb: BasicBlockId,
    results: &DataflowResults<'_, LivenessAnalysis>,
) -> fmt::Result {
    let entry = &results.entry_states[bb];
    let exit = &results.exit_states[bb];

    write!(write, "{bb}: {{")?;
    format_liveness_state(&mut write, entry)?;
    write!(write, "}} -> {{")?;
    format_liveness_state(&mut write, exit)?;
    write!(write, "}}")?;
    writeln!(write)
}

fn format_liveness(
    body: &Body<'_>,
    results: &DataflowResults<'_, LivenessAnalysis>,
) -> impl Display {
    core::fmt::from_fn(|fmt| {
        for bb in body.basic_blocks.ids() {
            format_liveness_result(&mut *fmt, bb, results)?;
        }

        Ok(())
    })
}

fn format_body<'heap>(env: &Environment<'heap>, body: &Body<'heap>) -> impl Display {
    let formatter = Formatter::new(env.heap);
    let mut text_formatter = TextFormat {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: TypeFormatter::new(&formatter, env, TypeFormatterOptions::terse()),
    };

    text_formatter.format_body(body).expect("infallible");

    String::from_utf8_lossy_owned(text_formatter.writer)
}

#[track_caller]
fn assert_liveness<'heap>(name: &'static str, env: &Environment<'heap>, body: &Body<'heap>) {
    let results = LivenessAnalysis.iterate_to_fixpoint(body);

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/liveness"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    assert_snapshot!(
        name,
        format!(
            "{}\n\n========\n\n{}",
            format_body(env, body),
            format_liveness(body, &results)
        )
    );
}

#[test]
fn direction_is_backward() {
    assert_eq!(LivenessAnalysis::DIRECTION, Direction::Backward);
}

/// Simple straight-line code: `x = 5; return x`.
#[test]
fn use_after_def() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 5;
            return x;
        }
    });

    assert_liveness("use_after_def", &env, &body);
}

/// Dead variable: `x = 5; return 0`.
#[test]
fn dead_variable() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 5;
            return 0;
        }
    });

    assert_liveness("dead_variable", &env, &body);
}

/// Use before def in same block: `y = x; x = 5; return y`.
#[test]
fn use_before_def() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            y = load x;
            x = load 5;
            return y;
        }
    });

    assert_liveness("use_before_def", &env, &body);
}

/// Cross-block liveness: bb0 defines x, bb1 uses x.
#[test]
fn cross_block() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 5;
            goto bb1();
        },
        bb1() {
            return x;
        }
    });

    assert_liveness("cross_block", &env, &body);
}

/// Diamond CFG where variable is used in both branches.
#[test]
fn diamond_both_branches_use() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, z: Int, result: Int;

        bb0() {
            x = load 5;
            if x then bb1() else bb2();
        },
        bb1() {
            y = load x;
            goto bb3(y);
        },
        bb2() {
            z = load x;
            goto bb3(z);
        },
        bb3(result) {
            return result;
        }
    });

    assert_liveness("diamond_both_branches_use", &env, &body);
}

/// Block parameters kill liveness.
#[test]
fn block_parameter_kills() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            goto bb1(5);
        },
        bb1(x) {
            return x;
        }
    });

    assert_liveness("block_parameter_kills", &env, &body);
}

/// Loop: variable used in loop body.
#[test]
fn loop_liveness() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            x = load 0;
            goto bb1();
        },
        bb1() {
            cond = bin.< x 10;
            x = load x;
            switch cond [1 => bb1(), _ => bb2()];
        },
        bb2() {
            return x;
        }
    });

    assert_liveness("loop_liveness", &env, &body);
}

/// Multiple definitions: only the last one before use matters.
#[test]
fn multiple_definitions() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 1;
            x = load 2;
            x = load 3;
            return x;
        }
    });

    assert_liveness("multiple_definitions", &env, &body);
}

/// Binary operation: both operands should be live.
#[test]
fn binary_op_both_operands_live() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Int, z: Bool;

        bb0() {
            z = bin.== x y;
            return z;
        }
    });

    assert_liveness("binary_op_both_operands_live", &env, &body);
}

/// Only one branch uses variable.
#[test]
fn diamond_one_branch_uses() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int;

        bb0() {
            x = load 5;
            if x then bb1() else bb2();
        },
        bb1() {
            return x;
        },
        bb2() {
            return 0;
        }
    });

    assert_liveness("diamond_one_branch_uses", &env, &body);
}
