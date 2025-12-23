use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::InstSimplify;
use crate::{
    body::Body,
    builder::{op, scaffold},
    context::MirContext,
    def::DefIdSlice,
    pass::TransformPass as _,
    pretty::TextFormat,
};

#[track_caller]
fn assert_inst_simplify_pass<'heap>(
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

    let changed = InstSimplify::new().run(context, &mut bodies[0]);
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
    settings.set_snapshot_path(dir.join("tests/ui/pass/inst_simplify"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

// =============================================================================
// Constant Folding (Bitwise on integers, Unary - not in source language)
// =============================================================================

/// Tests constant folding for bitwise AND on integers.
///
/// ```text
/// bb0:
///     %result = 2 & 3
///     return %result
/// ```
#[test]
fn const_fold_bit_and() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let result = builder.local("result", TypeBuilder::synthetic(&env).integer());
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.binary(const_2, op![&], const_3))
        .ret(result);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).integer());

    assert_inst_simplify_pass(
        "const_fold_bit_and",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant folding for bitwise OR on integers.
///
/// ```text
/// bb0:
///     %result = 2 | 1
///     return %result
/// ```
#[test]
fn const_fold_bit_or() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let result = builder.local("result", TypeBuilder::synthetic(&env).integer());
    let const_2 = builder.const_int(2);
    let const_1 = builder.const_int(1);
    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.binary(const_2, op![|], const_1))
        .ret(result);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).integer());

    assert_inst_simplify_pass(
        "const_fold_bit_or",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant folding for unary NOT.
///
/// ```text
/// bb0:
///     %result = !true
///     return %result
/// ```
#[test]
fn const_fold_unary_not() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let result = builder.local("result", TypeBuilder::synthetic(&env).boolean());
    let const_true = builder.const_bool(true);
    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.unary(op![!], const_true))
        .ret(result);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).boolean());

    assert_inst_simplify_pass(
        "const_fold_unary_not",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant folding for unary negation.
///
/// ```text
/// bb0:
///     %result = -5
///     return %result
/// ```
#[test]
fn const_fold_unary_neg() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let result = builder.local("result", TypeBuilder::synthetic(&env).integer());
    let const_5 = builder.const_int(-5);
    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.unary(op![neg], const_5))
        .ret(result);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).integer());

    assert_inst_simplify_pass(
        "const_fold_unary_neg",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

// =============================================================================
// Bitwise Identity on Integers (x | 0 => x - not in source language)
// =============================================================================

/// Tests identity simplification for bitwise OR with zero.
///
/// ```text
/// bb0:
///     %result = %x | 0
///     return %result
/// ```
#[test]
fn identity_bit_or_zero() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let result = builder.local("result", TypeBuilder::synthetic(&env).integer());
    let const_0 = builder.const_int(0);
    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.binary(x, op![|], const_0))
        .ret(result);

    let body = builder.finish(1, TypeBuilder::synthetic(&env).integer());

    assert_inst_simplify_pass(
        "identity_bit_or_zero",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

// =============================================================================
// Identical Operand Patterns (BitAnd/BitOr on integers - not in source)
// =============================================================================

/// Tests idempotent simplification for bitwise AND with identical operands.
///
/// ```text
/// bb0:
///     %result = %x & %x
///     return %result
/// ```
#[test]
fn identical_operand_bit_and() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let result = builder.local("result", TypeBuilder::synthetic(&env).integer());
    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.binary(x, op![&], x))
        .ret(result);

    let body = builder.finish(1, TypeBuilder::synthetic(&env).integer());

    assert_inst_simplify_pass(
        "identical_operand_bit_and",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests idempotent simplification for bitwise OR with identical operands.
///
/// ```text
/// bb0:
///     %result = %x | %x
///     return %result
/// ```
#[test]
fn identical_operand_bit_or() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let result = builder.local("result", TypeBuilder::synthetic(&env).integer());
    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.binary(x, op![|], x))
        .ret(result);

    let body = builder.finish(1, TypeBuilder::synthetic(&env).integer());

    assert_inst_simplify_pass(
        "identical_operand_bit_or",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

// =============================================================================
// Block Parameter Propagation (requires CFG control)
// =============================================================================

/// Tests constant propagation through block params with single predecessor.
///
/// ```text
/// bb0:
///     goto bb1(5)
///
/// bb1(%p):
///     %result = %p == 5
///     return %result
/// ```
#[test]
fn block_param_single_predecessor() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let param = builder.local("p", TypeBuilder::synthetic(&env).integer());
    let result = builder.local("result", TypeBuilder::synthetic(&env).boolean());
    let const_5 = builder.const_int(5);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([param.local]);

    builder.build_block(bb0).goto(bb1, [const_5]);

    builder
        .build_block(bb1)
        .assign_place(result, |rv| rv.binary(param, op![==], const_5))
        .ret(result);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).boolean());

    assert_inst_simplify_pass(
        "block_param_single_predecessor",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant propagation when all predecessors agree on value.
///
/// ```text
/// bb0:
///     switch %cond -> [0: bb1, 1: bb2]
///
/// bb1:
///     goto bb3(42)
///
/// bb2:
///     goto bb3(42)
///
/// bb3(%p):
///     %result = %p == 42
///     return %result
/// ```
#[test]
fn block_param_predecessors_agree() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let cond = builder.local("cond", TypeBuilder::synthetic(&env).integer());
    let param = builder.local("p", TypeBuilder::synthetic(&env).integer());
    let result = builder.local("result", TypeBuilder::synthetic(&env).boolean());
    let const_42 = builder.const_int(42);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([param.local]);

    builder
        .build_block(bb0)
        .switch(cond, |switch| switch.case(0, bb1, []).case(1, bb2, []));

    builder.build_block(bb1).goto(bb3, [const_42]);
    builder.build_block(bb2).goto(bb3, [const_42]);

    builder
        .build_block(bb3)
        .assign_place(result, |rv| rv.binary(param, op![==], const_42))
        .ret(result);

    let body = builder.finish(1, TypeBuilder::synthetic(&env).boolean());

    assert_inst_simplify_pass(
        "block_param_predecessors_agree",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests no propagation when predecessors disagree on value.
///
/// ```text
/// bb0:
///     switch %cond -> [0: bb1, 1: bb2]
///
/// bb1:
///     goto bb3(1)
///
/// bb2:
///     goto bb3(2)
///
/// bb3(%p):
///     %result = %p == 1
///     return %result
/// ```
#[test]
fn block_param_predecessors_disagree() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let cond = builder.local("cond", TypeBuilder::synthetic(&env).integer());
    let param = builder.local("p", TypeBuilder::synthetic(&env).integer());
    let result = builder.local("result", TypeBuilder::synthetic(&env).boolean());
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([param.local]);

    builder
        .build_block(bb0)
        .switch(cond, |switch| switch.case(0, bb1, []).case(1, bb2, []));

    builder.build_block(bb1).goto(bb3, [const_1]);
    builder.build_block(bb2).goto(bb3, [const_2]);

    builder
        .build_block(bb3)
        .assign_place(result, |rv| rv.binary(param, op![==], const_1))
        .ret(result);

    let body = builder.finish(1, TypeBuilder::synthetic(&env).boolean());

    assert_inst_simplify_pass(
        "block_param_predecessors_disagree",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

// =============================================================================
// Idempotent to Constant Forwarding (requires bitwise op)
// =============================================================================

/// Tests that idempotent simplification propagates constants through the result.
///
/// ```text
/// bb0:
///     %x = 42
///     %y = %x & %x
///     %result = %y == 42
///     return %result
/// ```
#[test]
fn idempotent_to_const_forwarding() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let x = builder.local("x", TypeBuilder::synthetic(&env).integer());
    let y = builder.local("y", TypeBuilder::synthetic(&env).integer());
    let result = builder.local("result", TypeBuilder::synthetic(&env).boolean());
    let const_42 = builder.const_int(42);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_42))
        .assign_place(y, |rv| rv.binary(x, op![&], x))
        .assign_place(result, |rv| rv.binary(y, op![==], const_42))
        .ret(result);

    let body = builder.finish(0, TypeBuilder::synthetic(&env).boolean());

    assert_inst_simplify_pass(
        "idempotent_to_const_forwarding",
        body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
