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

use super::CopyPropagation;
use crate::{
    body::{
        Body,
        operand::Operand,
        terminator::{GraphRead, GraphReadHead, GraphReadTail, TerminatorKind},
    },
    builder::{BodyBuilder, body, op},
    context::MirContext,
    def::DefIdSlice,
    intern::Interner,
    pass::TransformPass as _,
    pretty::TextFormat,
};

#[track_caller]
fn assert_cp_pass<'heap>(
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

    let changed = CopyPropagation::new().run(context, &mut bodies[0]);
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
    settings.set_snapshot_path(dir.join("tests/ui/pass/copy_propagation"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests basic constant propagation through operands.
#[test]
fn single_constant() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Bool;

        bb0() {
            x = load 1;
            y = bin.== x x;
            return y;
        }
    });

    assert_cp_pass(
        "single_constant",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests chain propagation through multiple loads.
#[test]
fn constant_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Int, z: Int, w: Bool;

        bb0() {
            x = load 1;
            y = load x;
            z = load y;
            w = bin.== z z;
            return w;
        }
    });

    assert_cp_pass(
        "constant_chain",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests block parameter propagation when all predecessors agree on the same constant.
#[test]
fn block_param_unanimous() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl cond: Bool, p: Int, r: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(1);
        },
        bb2() {
            goto bb3(1);
        },
        bb3(p) {
            r = bin.== p p;
            return r;
        }
    });

    assert_cp_pass(
        "block_param_unanimous",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that block parameters are not propagated when predecessors disagree.
#[test]
fn block_param_disagreement() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl cond: Bool, p: Int, r: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(1);
        },
        bb2() {
            goto bb3(2);
        },
        bb3(p) {
            r = bin.== p p;
            return r;
        }
    });

    assert_cp_pass(
        "block_param_disagreement",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that block parameter propagation resolves locals through the constants map.
#[test]
fn block_param_via_local() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, p: Int, r: Bool;

        bb0() {
            x = load 1;
            goto bb1(x);
        },
        bb1(p) {
            r = bin.== p p;
            return r;
        }
    });

    assert_cp_pass(
        "block_param_via_local",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that blocks with effectful predecessors are conservatively skipped.
///
/// ```text
/// bb0:
///   graph_read -> bb2
/// bb1:
///   goto bb2(1)
/// bb2(p):
///   r = p == p
///   return r
/// ```
///
/// Even though bb1 passes `const 1`, bb0 is an effectful predecessor (`GraphRead`) so
/// block parameter propagation is skipped entirely for bb2. The param `p` is NOT
/// propagated as a constant.
///
/// Uses the fluent API because of the custom terminator.
#[test]
fn block_param_effectful() {
    let heap = hashql_core::heap::Heap::new();
    let interner = Interner::new(&heap);

    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let mut builder = BodyBuilder::new(&interner);
    let axis = builder.local("axis", TypeBuilder::synthetic(&env).unknown());
    let p = builder.local("p", int_ty);
    let r = builder.local("r", bool_ty);

    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([p.local]);

    builder
        .build_block(bb0)
        .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
            head: GraphReadHead::Entity {
                axis: Operand::Place(axis),
            },
            body: Vec::new_in(&heap),
            tail: GraphReadTail::Collect,
            target: bb2,
        }));

    builder.build_block(bb1).goto(bb2, [const_1]);

    builder
        .build_block(bb2)
        .assign_place(r, |rv| rv.binary(p, op![==], p))
        .ret(r);

    let body = builder.finish(1, bool_ty);

    assert_cp_pass(
        "block_param_effectful",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that places with projections are not propagated.
#[test]
fn projection_unchanged() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: (Int, Int), y: Int, r: Bool;
        @proj x_0 = x.0: Int;

        bb0() {
            x = tuple 1, 2;
            y = load x_0;
            r = bin.== y y;
            return r;
        }
    });

    assert_cp_pass(
        "projection_unchanged",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that constants on loop back-edges are not discovered (no fix-point iteration).
#[test]
fn loop_back_edge() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, r: Bool, cond: Bool;

        bb0() {
            cond = load true;
            goto bb1(1);
        },
        bb1(x) {
            r = bin.== x x;
            if cond then bb1(2) else bb2();
        },
        bb2() {
            return r;
        }
    });

    assert_cp_pass(
        "loop_back_edge",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests simple copy propagation: `_2 = _1; use(_2)` → `use(_1)`.
#[test]
fn simple_copy() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Int, r: Bool;

        bb0() {
            y = load x;
            r = bin.== y y;
            return r;
        }
    });

    assert_cp_pass(
        "simple_copy",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests chained copy propagation: `_2 = _1; _3 = _2; use(_3)` → `use(_1)`.
#[test]
fn copy_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Int, z: Int, r: Bool;

        bb0() {
            y = load x;
            z = load y;
            r = bin.== z z;
            return r;
        }
    });

    assert_cp_pass(
        "copy_chain",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests block parameter propagation when all predecessors pass the same local (copy).
#[test]
fn block_param_copy() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, cond: Bool, p: Int, r: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(x);
        },
        bb2() {
            goto bb3(x);
        },
        bb3(p) {
            r = bin.== p p;
            return r;
        }
    });

    assert_cp_pass(
        "block_param_copy",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that block parameters are not propagated when predecessors pass different locals.
#[test]
fn block_param_copy_disagreement() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Bool {
        decl x: Int, y: Int, cond: Bool, p: Int, r: Bool;

        bb0() {
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(x);
        },
        bb2() {
            goto bb3(y);
        },
        bb3(p) {
            r = bin.== p p;
            return r;
        }
    });

    assert_cp_pass(
        "block_param_copy_disagreement",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
