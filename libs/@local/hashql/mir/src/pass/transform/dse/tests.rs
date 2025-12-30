#![expect(clippy::min_ident_chars, reason = "tests")]

use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::Heap,
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::DeadStoreElimination;
use crate::{
    body::{
        Body,
        operand::Operand,
        terminator::{GraphRead, GraphReadHead, GraphReadTail, TerminatorKind},
    },
    builder::{body, scaffold},
    context::MirContext,
    def::DefIdSlice,
    intern::Interner,
    pass::TransformPass as _,
    pretty::TextFormat,
};

#[track_caller]
fn assert_dse_pass<'heap>(
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
    let mut text_format = TextFormat {
        writer: Vec::new(),
        indent: 4,
        sources: (),
        types: &mut formatter,
    };

    let mut bodies = [body];

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let changed = DeadStoreElimination::new().run(context, &mut bodies[0]);
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
    settings.set_snapshot_path(dir.join("tests/ui/pass/dse"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests that a CFG with all locals used is unchanged.
#[test]
fn all_live() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = input.load! "input";
            y = load x;
            return y;
        }
    });

    assert_dse_pass(
        "all_live",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of a single dead assignment.
#[test]
fn single_dead_assignment() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, dead: Int;

        bb0() {
            x = input.load! "input";
            dead = load 42; // dead - never used
            return x;
        }
    });

    assert_dse_pass(
        "single_dead_assignment",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of a chain of dead assignments where none reach a root use.
#[test]
fn dead_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, a: Int, b: Int, c: Int;

        bb0() {
            x = input.load! "input";
            a = load x;  // dead - only used by b
            b = load a;  // dead - only used by c
            c = load b;  // dead - never used
            return x;
        }
    });

    assert_dse_pass(
        "dead_chain",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of a dead cycle where locals depend on each other but none reach a root.
#[test]
fn dead_cycle() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, a: Int, b: Int;

        bb0(a, b) {
            goto bb0(b, a); // a <- b, b <- a cycle
        },
        bb1() {
            x = input.load! "input";
            goto bb0(x, x);
        }
    });

    assert_dse_pass(
        "dead_cycle",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that dead params are removed while live siblings are preserved.
#[test]
fn dead_param_with_live_sibling() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl dead: Int, live: Int;

        bb0() {
            goto bb1(1, 2);
        },
        bb1(dead, live) {
            return live;
        }
    });

    assert_dse_pass(
        "dead_param_with_live_sibling",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that branch conditions are treated as root uses and preserved.
#[test]
fn branch_condition_preserved() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, cond: Bool;

        bb0() {
            x = input.load! "input";
            cond = bin.== x x; // live - used in branch condition
            if cond then bb1() else bb2();
        },
        bb1() {
            return 1;
        },
        bb2() {
            return 2;
        }
    });

    assert_dse_pass(
        "branch_condition_preserved",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of StorageLive/StorageDead for dead locals.
#[test]
fn dead_storage_statements() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, dead: Int;

        bb0() {
            let (dead.local);
            x = input.load! "input";
            dead = load 42; // dead assignment
            drop (dead.local);
            return x;
        }
    });

    assert_dse_pass(
        "dead_storage_statements",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests dead param elimination with multiple predecessors.
#[test]
fn dead_param_multiple_predecessors() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl cond: Bool, dead: Int, live: Int;

        bb0() {
            cond = input.load! "cond";
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(1, 10);
        },
        bb2() {
            goto bb3(2, 20);
        },
        bb3(dead, live) {
            return live;
        }
    });

    assert_dse_pass(
        "dead_param_multiple_predecessors",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that graph read effect tokens are always kept live.
///
/// Uses fluent builder API because `GraphRead` terminator is not supported by the `body!` macro.
#[test]
fn graph_read_token_preserved() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let token_ty =
        TypeBuilder::synthetic(&env).opaque("GraphToken", TypeBuilder::synthetic(&env).unknown());

    let axis = builder.local("axis", TypeBuilder::synthetic(&env).unknown());
    let token = builder.local("token", token_ty);
    let dead = builder.local("dead", int_ty);

    let const_0 = builder.const_int(0);
    let const_42 = builder.const_int(42);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([token.local]);

    builder
        .build_block(bb0)
        .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
            head: GraphReadHead::Entity {
                axis: Operand::Place(axis),
            },
            body: Vec::new_in(&heap),
            tail: GraphReadTail::Collect,
            target: bb1,
        }));

    builder
        .build_block(bb1)
        .assign_place(dead, |rv| rv.load(const_42))
        .ret(const_0);

    let body = builder.finish(1, int_ty);

    assert_dse_pass(
        "graph_read_token_preserved",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
