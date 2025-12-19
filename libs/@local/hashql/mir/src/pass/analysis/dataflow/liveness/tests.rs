//! Tests for liveness analysis.

use core::fmt::{self, Display};
use std::path::PathBuf;

use hashql_core::{
    id::bit_vec::DenseBitSet,
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use insta::{Settings, assert_snapshot};

use super::LivenessAnalysis;
use crate::{
    body::{Body, basic_block::BasicBlockId, local::Local},
    builder::{op, scaffold},
    pass::analysis::dataflow::framework::{DataflowAnalysis as _, DataflowResults, Direction},
    pretty::TextFormat,
};

fn format_liveness_state(mut write: impl fmt::Write, state: &DenseBitSet<Local>) -> fmt::Result {
    for (index, local) in state.iter().enumerate() {
        if index > 0 {
            write!(write, ", ")?;
        }

        write!(write, "%{local}")?;
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

    write!(write, "bb{bb}: {{")?;
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
///
/// At block entry, `x` should NOT be live (it's defined before use).
#[test]
fn use_after_def() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);

    let bb0 = builder.reserve_block([]);

    let const_5 = builder.const_int(5);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_5))
        .ret(x);

    let body = builder.finish(0, int_ty);
    assert_liveness("use_after_def", &env, &body);
}

/// Dead variable: `x = 5; return 0`.
///
/// `x` is never used, so it should never be live.
#[test]
fn dead_variable() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);

    let const_5 = builder.const_int(5);
    let const_0 = builder.const_int(0);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_5))
        .ret(const_0);

    let body = builder.finish(0, int_ty);
    assert_liveness("dead_variable", &env, &body);
}

/// Use before def in same block: `y = x; x = 5; return y`.
///
/// `x` is used before being defined, so it's live at block entry.
#[test]
fn use_before_def() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);

    let bb0 = builder.reserve_block([]);

    let const_5 = builder.const_int(5);

    builder
        .build_block(bb0)
        .assign_place(y, |rv| rv.load(x))
        .assign_place(x, |rv| rv.load(const_5))
        .ret(y);

    let body = builder.finish(0, int_ty);
    assert_liveness("use_before_def", &env, &body);
}

/// Cross-block liveness: bb0 defines x, bb1 uses x.
///
/// ```text
/// bb0:
///     x = 5
///     goto bb1
/// bb1:
///     return x
/// ```
#[test]
fn cross_block() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);

    let const_5 = builder.const_int(5);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_5))
        .goto(bb1, []);

    builder.build_block(bb1).ret(x);

    let body = builder.finish(0, int_ty);
    assert_liveness("cross_block", &env, &body);
}

/// Diamond CFG where variable is used in both branches.
///
/// ```text
/// bb0:
///     x = 5
///     if cond goto bb1 else bb2
/// bb1:
///     y = x
///     goto bb3(y)
/// bb2:
///     z = x
///     goto bb3(z)
/// bb3(result):
///     return result
/// ```
#[test]
fn diamond_both_branches_use() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let z = builder.local("z", int_ty);
    let result = builder.local("result", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([result.local]);

    let const_5 = builder.const_int(5);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_5))
        .if_else(x, bb1, [], bb2, []);

    builder
        .build_block(bb1)
        .assign_place(y, |rv| rv.load(x))
        .goto(bb3, [y.into()]);

    builder
        .build_block(bb2)
        .assign_place(z, |rv| rv.load(x))
        .goto(bb3, [z.into()]);

    builder.build_block(bb3).ret(result);

    let body = builder.finish(0, int_ty);
    assert_liveness("diamond_both_branches_use", &env, &body);
}

/// Block parameters kill liveness.
///
/// ```text
/// bb0:
///     goto bb1(5)
/// bb1(x):
///     return x
/// ```
#[test]
fn block_parameter_kills() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([x.local]);

    let const_5 = builder.const_int(5);

    builder.build_block(bb0).goto(bb1, [const_5]);
    builder.build_block(bb1).ret(x);

    let body = builder.finish(0, int_ty);
    assert_liveness("block_parameter_kills", &env, &body);
}

/// Loop: variable used in loop body.
///
/// ```text
/// bb0:
///     x = 0
///     goto bb1
/// bb1:
///     cond = x < 10
///     x = x  (reassign to simulate update)
///     if cond goto bb1 else bb2
/// bb2:
///     return x
/// ```
#[test]
#[expect(clippy::similar_names)]
fn loop_liveness() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", int_ty);
    let cond = builder.local("cond", bool_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);

    let const_0 = builder.const_int(0);
    let const_10 = builder.const_int(10);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_0))
        .goto(bb1, []);

    builder
        .build_block(bb1)
        .assign_place(cond, |rv| rv.binary(x, op![<], const_10))
        .assign_place(
            x,
            // reassign x to itself
            |rv| rv.load(x),
        )
        .switch(cond, |switch| switch.case(1, bb1, []).otherwise(bb2, []));

    builder.build_block(bb2).ret(x);

    let body = builder.finish(0, int_ty);
    assert_liveness("loop_liveness", &env, &body);
}

/// Multiple definitions: only the last one before use matters.
///
/// ```text
/// bb0:
///     x = 1
///     x = 2
///     x = 3
///     return x
/// ```
#[test]
fn multiple_definitions() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(x, |rv| rv.load(const_2))
        .assign_place(x, |rv| rv.load(const_3))
        .ret(x);

    let body = builder.finish(0, int_ty);
    assert_liveness("multiple_definitions", &env, &body);
}

/// Binary operation: both operands should be live.
///
/// ```text
/// bb0:
///     z = x == y
///     return z
/// ```
#[test]
fn binary_op_both_operands_live() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let z = builder.local("z", bool_ty);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(z, |rv| rv.binary(x, op![==], y))
        .ret(z);

    let body = builder.finish(0, bool_ty);
    assert_liveness("binary_op_both_operands_live", &env, &body);
}

/// Only one branch uses variable.
///
/// ```text
/// bb0:
///     x = 5
///     if cond goto bb1 else bb2
/// bb1:
///     return x
/// bb2:
///     return 0
/// ```
#[test]
fn diamond_one_branch_uses() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);

    let const_5 = builder.const_int(5);
    let const_0 = builder.const_int(0);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_5))
        .if_else(x, bb1, [], bb2, []);

    builder.build_block(bb1).ret(x);
    builder.build_block(bb2).ret(const_0);

    let body = builder.finish(0, int_ty);
    assert_liveness("diamond_one_branch_uses", &env, &body);
}
