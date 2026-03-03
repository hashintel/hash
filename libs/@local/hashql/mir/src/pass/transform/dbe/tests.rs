#![expect(clippy::min_ident_chars, reason = "tests")]
use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::{Heap, Scratch},
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::DeadBlockElimination;
use crate::{
    body::Body, builder::body, context::MirContext, def::DefIdSlice, intern::Interner,
    pass::TransformPass as _, pretty::TextFormatOptions,
};

#[track_caller]
fn assert_dbe_pass<'heap>(
    name: &'static str,
    body: Body<'heap>,
    context: &mut MirContext<'_, 'heap>,
) {
    let formatter = Formatter::new(context.heap);
    let mut formatter = TypeFormatter::new(
        &formatter,
        context.env,
        TypeFormatterOptions::terse().with_qualified_opaque_names(true),
    );
    let mut text_format = TextFormatOptions {
        writer: Vec::new(),
        indent: 4,
        sources: (),
        types: &mut formatter,
        annotations: (),
    }
    .build();

    let mut bodies = [body];

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let changed = DeadBlockElimination::new_in(Scratch::new()).run(context, &mut bodies[0]);
    write!(
        text_format.writer,
        "\n\n{:=^50}\n\n",
        format!(" Changed: {changed:?} ")
    )
    .expect("infallible");

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/dbe"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests that a CFG with all blocks reachable is unchanged.
#[test]
fn all_reachable() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            goto bb1();
        },
        bb1() {
            return null;
        }
    });

    assert_dbe_pass(
        "all_reachable",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of a single unreachable block at the end.
#[test]
fn single_unreachable_at_end() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            return null;
        },
        bb1() {
            unreachable; // dead
        }
    });

    assert_dbe_pass(
        "single_unreachable_at_end",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of an unreachable block in the middle, requiring ID remapping.
#[test]
fn unreachable_in_middle() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            goto bb2();
        },
        bb1() {
            unreachable;
        },
        bb2() {
            return null;
        }
    });

    assert_dbe_pass(
        "unreachable_in_middle",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of multiple consecutive unreachable blocks.
#[test]
fn multiple_unreachable_at_end() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            return null;
        },
        bb1() {
            unreachable;
        },
        bb2() {
            unreachable;
        },
        bb3() {
            unreachable;
        }
    });

    assert_dbe_pass(
        "multiple_unreachable_at_end",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of scattered unreachable blocks requiring complex remapping.
#[test]
fn scattered_unreachable() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            goto bb2();
        },
        bb1() {
            unreachable;
        },
        bb2() {
            goto bb4();
        },
        bb3() {
            unreachable;
        },
        bb4() {
            return null;
        }
    });

    assert_dbe_pass(
        "scattered_unreachable",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that switch targets are correctly remapped.
#[test]
fn switch_target_remapping() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@1/1 -> Null {
        decl selector: Int;

        bb0() {
            switch selector [0 => bb2(), 1 => bb3()];
        },
        bb1() {
            unreachable;
        },
        bb2() {
            return null;
        },
        bb3() {
            return null;
        }
    });

    assert_dbe_pass(
        "switch_target_remapping",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that block parameters are preserved through remapping.
#[test]
fn block_params_preserved() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl p: Int, result: Int;

        bb0() {
            goto bb2(1);
        },
        bb1() {
            unreachable;
        },
        bb2(p) {
            result = load p;
            return null;
        }
    });

    assert_dbe_pass(
        "block_params_preserved",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that a chain of unreachable blocks pointing to each other is removed.
#[test]
fn unreachable_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Null {
        decl;

        bb0() {
            return null;
        },
        bb1() {
            goto bb2(); // dead chain
        },
        bb2() {
            goto bb3(); // dead chain
        },
        bb3() {
            unreachable; // dead chain
        }
    });

    assert_dbe_pass(
        "unreachable_chain",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
