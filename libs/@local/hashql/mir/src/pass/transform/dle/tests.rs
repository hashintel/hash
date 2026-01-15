#![expect(clippy::min_ident_chars, reason = "tests")]

use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::Scratch,
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::DeadLocalElimination;
use crate::{
    body::Body, builder::scaffold, context::MirContext, def::DefIdSlice, pass::TransformPass as _,
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
///
/// ```text
/// _0 = const 1
/// _1 = _0
/// return _1
/// ```
#[test]
fn all_live() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let y = builder.local("y", ty);

    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(y, |rv| rv.load(x))
        .ret(y);

    let body = builder.finish(0, ty);

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
///
/// Before:
/// ```text
/// locals: [_0, _1]  // _1 is never referenced
/// _0 = const 1
/// return _0
/// ```
///
/// After:
/// ```text
/// locals: [_0]
/// _0 = const 1
/// return _0
/// ```
#[test]
fn single_dead_at_end() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let _dead = builder.local("dead", ty); // unused

    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .ret(x);

    let body = builder.finish(0, ty);

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
///
/// Before:
/// ```text
/// locals: [_0, _1, _2]  // _1 is never referenced
/// _0 = const 1
/// _2 = _0
/// return _2
/// ```
///
/// After:
/// ```text
/// locals: [_0, _1]  // old _2 remapped to _1
/// _0 = const 1
/// _1 = _0
/// return _1
/// ```
#[test]
fn dead_in_middle() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let _dead = builder.local("dead", ty); // unused, in middle
    let y = builder.local("y", ty);

    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(y, |rv| rv.load(x))
        .ret(y);

    let body = builder.finish(0, ty);

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
///
/// Before:
/// ```text
/// locals: [_0, _1, _2, _3, _4]  // _1 and _3 are never referenced
/// _0 = const 1
/// _2 = _0
/// _4 = _2
/// return _4
/// ```
///
/// After:
/// ```text
/// locals: [_0, _1, _2]  // old _2 -> _1, old _4 -> _2
/// _0 = const 1
/// _1 = _0
/// _2 = _1
/// return _2
/// ```
#[test]
fn scattered_dead() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let a = builder.local("a", ty);
    let _dead1 = builder.local("dead1", ty); // unused
    let b = builder.local("b", ty);
    let _dead2 = builder.local("dead2", ty); // unused
    let c = builder.local("c", ty);

    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(a, |rv| rv.load(const_1))
        .assign_place(b, |rv| rv.load(a))
        .assign_place(c, |rv| rv.load(b))
        .ret(c);

    let body = builder.finish(0, ty);

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
///
/// Before:
/// ```text
/// fn body(_0: int, _1: int) -> int {  // 2 args, _1 unused
///     locals: [_0, _1, _2]
///     bb0:
///         _2 = _0
///         return _2
/// }
/// ```
///
/// After:
/// ```text
/// fn body(_0: int, _1: int) -> int {  // args preserved
///     locals: [_0, _1, _2]
///     bb0:
///         _2 = _0
///         return _2
/// }
/// ```
#[test]
fn unused_args_preserved() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let arg0 = builder.local("arg0", ty);
    let _arg1 = builder.local("arg1", ty); // unused arg
    let result = builder.local("result", ty);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.load(arg0))
        .ret(result);

    // 2 function arguments
    let body = builder.finish(2, ty);

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
#[test]
fn projection_locals_preserved() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let list_ty = TypeBuilder::synthetic(&env).list(int_ty);

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
