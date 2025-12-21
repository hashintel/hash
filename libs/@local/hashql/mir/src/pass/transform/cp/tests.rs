#![expect(clippy::min_ident_chars, reason = "tests")]

use std::path::PathBuf;

use bstr::ByteVec as _;
use hashql_core::{
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
    builder::{op, scaffold},
    context::MirContext,
    def::DefIdSlice,
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

    text_format
        .writer
        .extend(b"\n\n------------------------------------\n\n");

    CopyPropagation::new().run(context, &mut bodies[0]);

    text_format
        .format(DefIdSlice::from_raw(&bodies), &[])
        .expect("should be able to write bodies");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/cp"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests basic constant propagation through operands.
///
/// ```text
/// bb0:
///   x = 1
///   y = x == x
///   return y
/// ```
///
/// After copy propagation, uses of `x` should be replaced with `const 1`.
#[test]
fn single_constant() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", bool_ty);

    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(y, |rv| rv.binary(x, op![==], x))
        .ret(y);

    let body = builder.finish(0, bool_ty);

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
///
/// ```text
/// bb0:
///   x = 1
///   y = x
///   z = y
///   w = z == z
///   return w
/// ```
///
/// All locals in the chain should be tracked, and uses of `z` replaced with `const 1`.
#[test]
fn constant_chain() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let z = builder.local("z", int_ty);
    let w = builder.local("w", bool_ty);

    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(y, |rv| rv.load(x))
        .assign_place(z, |rv| rv.load(y))
        .assign_place(w, |rv| rv.binary(z, op![==], z))
        .ret(w);

    let body = builder.finish(0, bool_ty);

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
///
/// ```text
/// bb0:
///   cond = input
///   if cond -> bb1 else bb2
/// bb1:
///   goto bb3(1)
/// bb2:
///   goto bb3(1)
/// bb3(p):
///   r = p == p
///   return r
/// ```
///
/// Both predecessors pass `const 1`, so `p` should be propagated as a constant.
#[test]
fn block_param_unanimous() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let cond = builder.local("cond", bool_ty);
    let p = builder.local("p", int_ty);
    let r = builder.local("r", bool_ty);

    let const_1 = builder.const_int(1);
    let const_true = builder.const_bool(true);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([p.local]);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.load(const_true))
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, [const_1]);
    builder.build_block(bb2).goto(bb3, [const_1]);

    builder
        .build_block(bb3)
        .assign_place(r, |rv| rv.binary(p, op![==], p))
        .ret(r);

    let body = builder.finish(0, bool_ty);

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
///
/// ```text
/// bb0:
///   cond = input
///   if cond -> bb1 else bb2
/// bb1:
///   goto bb3(1)
/// bb2:
///   goto bb3(2)
/// bb3(p):
///   r = p == p
///   return r
/// ```
///
/// Predecessors pass different values, so `p` should not be propagated.
#[test]
fn block_param_disagreement() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let cond = builder.local("cond", bool_ty);
    let p = builder.local("p", int_ty);
    let r = builder.local("r", bool_ty);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_true = builder.const_bool(true);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([p.local]);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.load(const_true))
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, [const_1]);
    builder.build_block(bb2).goto(bb3, [const_2]);

    builder
        .build_block(bb3)
        .assign_place(r, |rv| rv.binary(p, op![==], p))
        .ret(r);

    let body = builder.finish(0, bool_ty);

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
///
/// ```text
/// bb0:
///   x = 1
///   goto bb1(x)
/// bb1(p):
///   r = p == p
///   return r
/// ```
///
/// The predecessor passes local `x` which is known to be `const 1`. The `try_eval`
/// function should resolve this, allowing `p` to be propagated as a constant.
#[test]
fn block_param_via_local() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", int_ty);
    let p = builder.local("p", int_ty);
    let r = builder.local("r", bool_ty);

    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([p.local]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .goto(bb1, [x.into()]);

    builder
        .build_block(bb1)
        .assign_place(r, |rv| rv.binary(p, op![==], p))
        .ret(r);

    let body = builder.finish(0, bool_ty);

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
#[test]
fn block_param_effectful() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

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
///
/// ```text
/// bb0:
///   x = (1, 2)
///   y = x.0
///   r = y == y
///   return r
/// ```
///
/// Copy propagation only handles simple locals without projections. The projection
/// `x.0` should not be replaced, though `y` (if tracked) could be.
#[test]
fn projection_unchanged() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty]);

    let x = builder.local("x", tuple_ty);
    let y = builder.local("y", int_ty);
    let r = builder.local("r", bool_ty);

    let x_0 = builder.place(|place| place.from(x).field(0, int_ty));

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.tuple([const_1, const_2]))
        .assign_place(y, |rv| rv.load(x_0))
        .assign_place(r, |rv| rv.binary(y, op![==], y))
        .ret(r);

    let body = builder.finish(0, bool_ty);

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
///
/// ```text
/// bb0:
///   x = 1
///   goto bb1
/// bb1:
///   // x comes from bb0 (const 1) or bb1 (const 2) - disagreement
///   r = x == x
///   x = 2
///   if cond -> bb1 else bb2
/// bb2:
///   return r
/// ```
///
/// This documents the limitation: even though the back-edge always passes `const 2`,
/// we don't discover this because predecessors forming back-edges haven't been visited
/// when the loop header is processed.
#[test]
fn loop_back_edge() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", int_ty);
    let r = builder.local("r", bool_ty);
    let cond = builder.local("cond", bool_ty);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_true = builder.const_bool(true);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([x.local]);
    let bb2 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.load(const_true))
        .goto(bb1, [const_1]);

    builder
        .build_block(bb1)
        .assign_place(r, |rv| rv.binary(x, op![==], x))
        .if_else(cond, bb1, [const_2], bb2, []);

    builder.build_block(bb2).ret(r);

    let body = builder.finish(0, bool_ty);

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
