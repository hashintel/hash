#![expect(clippy::min_ident_chars, reason = "tests")]

use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::{Heap, Scratch},
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::DeadLocalElimination;
use crate::{
    body::Body,
    builder::{BodyBuilder, body},
    context::MirContext,
    def::DefIdSlice,
    intern::Interner,
    pass::TransformPass as _,
    pretty::TextFormat,
};

#[track_caller]
fn assert_dle_pass<'heap>(
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

    let changed = DeadLocalElimination::new_in(Scratch::new()).run(context, &mut bodies[0]);
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
    settings.set_snapshot_path(dir.join("tests/ui/pass/dle"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests that a body with all locals used is unchanged.
#[test]
fn all_live() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int;

        bb0() {
            x = load 1;
            y = load x;
            return y;
        }
    });

    assert_dle_pass(
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

/// Tests removal of a single unreferenced local at the end.
#[test]
fn single_dead_at_end() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, dead: Int; // dead is unused

        bb0() {
            x = load 1;
            return x;
        }
    });

    assert_dle_pass(
        "single_dead_at_end",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of an unreferenced local in the middle, requiring ID remapping.
#[test]
fn dead_in_middle() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, dead: Int, y: Int; // dead is unused, in middle

        bb0() {
            x = load 1;
            y = load x;
            return y;
        }
    });

    assert_dle_pass(
        "dead_in_middle",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests removal of multiple scattered unreferenced locals.
#[test]
fn scattered_dead() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/0 -> Int {
        decl a: Int, dead1: Int, b: Int, dead2: Int, c: Int; // dead1 and dead2 unused

        bb0() {
            a = load 1;
            b = load a;
            c = load b;
            return c;
        }
    });

    assert_dle_pass(
        "scattered_dead",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that function arguments are preserved even when not referenced.
#[test]
fn unused_args_preserved() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/2 -> Int {
        decl arg0: Int, arg1: Int, result: Int; // arg1 is unused arg

        bb0() {
            result = load arg0;
            return result;
        }
    });

    assert_dle_pass(
        "unused_args_preserved",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests locals used via projections are preserved.
///
/// When a local is accessed through a projection (e.g., `list[idx]`), both the base
/// local and any index locals must be preserved.
///
/// Uses fluent builder API because index projections are not supported by the `body!` macro.
#[test]
fn projection_locals_preserved() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let list_ty = TypeBuilder::synthetic(&env).list(int_ty);

    let mut builder = BodyBuilder::new(&interner);
    let list = builder.local("list", list_ty);
    let index = builder.local("index", int_ty);
    let element = builder.local("element", int_ty);

    let const_0 = builder.const_int(0);

    let bb0 = builder.reserve_block([]);

    let indexed_place = builder.place(|pb| pb.local(list.local).index(index.local, int_ty));

    builder
        .build_block(bb0)
        .assign_place(index, |rv| rv.load(const_0))
        .assign_place(element, |rv| rv.load(indexed_place))
        .ret(element);

    let body = builder.finish(1, int_ty);

    assert_dle_pass(
        "projection_locals_preserved",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
