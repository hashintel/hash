use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::Scratch,
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::DeadBlockElimination;
use crate::{
    body::Body, builder::scaffold, context::MirContext, def::DefIdSlice, pass::TransformPass as _,
    pretty::TextFormat,
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
///
/// Before & After:
/// ```text
/// bb0: goto bb1
/// bb1: return
/// ```
#[test]
fn all_reachable() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);

    builder.build_block(bb0).goto(bb1, []);
    builder.build_block(bb1).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
///
/// Before:
/// ```text
/// bb0: return
/// bb1: unreachable  // dead
/// ```
///
/// After:
/// ```text
/// bb0: return
/// ```
#[test]
fn single_unreachable_at_end() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // unreachable

    builder.build_block(bb0).ret(const_unit);
    builder.build_block(bb1).unreachable();

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
///
/// Before:
/// ```text
/// bb0: goto bb2
/// bb1: unreachable  // dead, in the middle
/// bb2: return
/// ```
///
/// After:
/// ```text
/// bb0: goto bb1  // bb2 remapped to bb1
/// bb1: return
/// ```
#[test]
fn unreachable_in_middle() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // unreachable, in middle
    let bb2 = builder.reserve_block([]);

    builder.build_block(bb0).goto(bb2, []);
    builder.build_block(bb1).unreachable();
    builder.build_block(bb2).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
///
/// Before:
/// ```text
/// bb0: return
/// bb1: unreachable
/// bb2: unreachable
/// bb3: unreachable
/// ```
///
/// After:
/// ```text
/// bb0: return
/// ```
#[test]
fn multiple_unreachable_at_end() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);

    builder.build_block(bb0).ret(const_unit);
    builder.build_block(bb1).unreachable();
    builder.build_block(bb2).unreachable();
    builder.build_block(bb3).unreachable();

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
///
/// Before:
/// ```text
/// bb0: goto bb2
/// bb1: unreachable  // dead
/// bb2: goto bb4
/// bb3: unreachable  // dead
/// bb4: return
/// ```
///
/// After:
/// ```text
/// bb0: goto bb1  // bb2 -> bb1
/// bb1: goto bb2  // bb4 -> bb2
/// bb2: return
/// ```
#[test]
fn scattered_unreachable() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // dead
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]); // dead
    let bb4 = builder.reserve_block([]);

    builder.build_block(bb0).goto(bb2, []);
    builder.build_block(bb1).unreachable();
    builder.build_block(bb2).goto(bb4, []);
    builder.build_block(bb3).unreachable();
    builder.build_block(bb4).ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
///
/// Before:
/// ```text
/// bb0: switch_int(x) -> [0: bb2, 1: bb3]
/// bb1: unreachable  // dead
/// bb2: return
/// bb3: return
/// ```
///
/// After:
/// ```text
/// bb0: switch_int(x) -> [0: bb1, 1: bb2]  // remapped
/// bb1: return
/// bb2: return
/// ```
#[test]
fn switch_target_remapping() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let selector = builder.local("selector", TypeBuilder::synthetic(&env).integer());

    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // dead
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .switch(selector, |switch| switch.case(0, bb2, []).case(1, bb3, []));
    builder.build_block(bb1).unreachable();
    builder.build_block(bb2).ret(const_unit);
    builder.build_block(bb3).ret(const_unit);

    let body = builder.finish(1, TypeBuilder::synthetic(&env).null());

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
///
/// Before:
/// ```text
/// bb0: goto bb2(const 1)
/// bb1: unreachable
/// bb2(p): use p; return
/// ```
///
/// After:
/// ```text
/// bb0: goto bb1(const 1)  // remapped
/// bb1(p): use p; return
/// ```
#[test]
fn block_params_preserved() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let param = builder.local("p", TypeBuilder::synthetic(&env).integer());
    let const_1 = builder.const_int(1);
    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]); // dead
    let bb2 = builder.reserve_block([param.local]);

    builder.build_block(bb0).goto(bb2, [const_1]);
    builder.build_block(bb1).unreachable();

    // Use param to ensure it's not optimized away
    let result = builder.local("result", TypeBuilder::synthetic(&env).integer());
    builder
        .build_block(bb2)
        .assign_place(result, |rv| rv.load(param))
        .ret(const_unit);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
///
/// Before:
/// ```text
/// bb0: return
/// bb1: goto bb2  // dead chain
/// bb2: goto bb3  // dead chain
/// bb3: unreachable  // dead chain
/// ```
///
/// After:
/// ```text
/// bb0: return
/// ```
#[test]
fn unreachable_chain() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let const_unit = builder.const_unit();

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([]);

    builder.build_block(bb0).ret(const_unit);
    // Dead chain: bb1 -> bb2 -> bb3
    builder.build_block(bb1).goto(bb2, []);
    builder.build_block(bb2).goto(bb3, []);
    builder.build_block(bb3).unreachable();

    let body = builder.finish(0, TypeBuilder::synthetic(&env).null());

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
