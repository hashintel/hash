#![expect(clippy::min_ident_chars, reason = "tests")]
use std::path::PathBuf;

use bstr::ByteVec as _;
use hashql_core::{
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::node::operation::InputOp;
use insta::{Settings, assert_snapshot};

use super::DeadStoreElimination;
use crate::{
    body::{
        Body,
        operand::Operand,
        terminator::{GraphRead, GraphReadHead, GraphReadTail, TerminatorKind},
    },
    context::MirContext,
    def::DefIdSlice,
    op,
    pass::TransformPass as _,
    pretty::TextFormat,
    scaffold,
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

    text_format
        .writer
        .extend(b"\n\n------------------------------------\n\n");

    DeadStoreElimination::new().run(context, &mut bodies[0]);

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
///
/// ```text
/// _0 = input
/// _1 = _0
/// return _1
/// ```
#[test]
fn all_live() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let x = builder.place_local(x);
    let y = builder.local("y", ty);
    let y = builder.place_local(y);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.input(InputOp::Load { required: true }, "input"))
        .assign_place(y, |rv| rv.load(x))
        .ret(y);

    let body = builder.finish(0, ty);

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
///
/// ```text
/// _0 = input
/// _1 = 42      // dead - never used
/// return _0
/// ```
#[test]
fn single_dead_assignment() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let x = builder.place_local(x);
    let dead = builder.local("dead", ty);
    let const_42 = builder.const_int(42);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.input(InputOp::Load { required: true }, "input"))
        .assign_local(dead, |rv| rv.load(const_42))
        .ret(x);

    let body = builder.finish(0, ty);

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
///
/// ```text
/// _0 = input
/// _1 = _0      // dead - only used by _2
/// _2 = _1      // dead - only used by _3
/// _3 = _2      // dead - never used
/// return _0
/// ```
///
/// This tests that liveness propagation correctly identifies the entire chain as dead.
#[test]
fn dead_chain() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let x = builder.place_local(x);
    let a = builder.local("a", ty);
    let a_place = builder.place_local(a);
    let b = builder.local("b", ty);
    let b_place = builder.place_local(b);
    let c = builder.local("c", ty);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.input(InputOp::Load { required: true }, "input"))
        .assign_local(a, |rv| rv.load(x))
        .assign_local(b, |rv| rv.load(a_place))
        .assign_local(c, |rv| rv.load(b_place))
        .ret(x);

    let body = builder.finish(0, ty);

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
///
/// ```text
/// bb0(a, b):
///   goto bb0(b, a)   // a <- b, b <- a cycle
/// bb1:
///   x = input
///   goto bb0(x, x)
/// ```
///
/// Neither a nor b reaches a root use, so both params and their args should be eliminated.
#[test]
fn dead_cycle() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let x = builder.place_local(x);
    let a = builder.local("a", ty);
    let b = builder.local("b", ty);

    let bb0 = builder.reserve_block([a, b]);
    let bb1 = builder.reserve_block([]);

    let a_place = builder.place_local(a);
    let b_place = builder.place_local(b);

    builder
        .build_block(bb0)
        .goto(bb0, [b_place.into(), a_place.into()]);

    builder
        .build_block(bb1)
        .assign_place(x, |rv| rv.input(InputOp::Load { required: true }, "input"))
        .goto(bb0, [x.into(), x.into()]);

    let body = builder.finish(1, ty);

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
///
/// ```text
/// bb0:
///   goto bb1(1, 2)
/// bb1(dead, live):
///   return live
/// ```
///
/// This tests selective removal: only dead params and their corresponding args are removed.
#[test]
fn dead_param_with_live_sibling() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let dead = builder.local("dead", ty);
    let live = builder.local("live", ty);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([dead, live]);

    let live = builder.place_local(live);

    builder.build_block(bb0).goto(bb1, [const_1, const_2]);

    builder.build_block(bb1).ret(live);

    let body = builder.finish(0, ty);

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
///
/// ```text
/// _0 = input
/// _1 = _0 == _0    // live - used in branch condition
/// if _1 -> bb1 else bb2
/// bb1: return 1
/// bb2: return 2
/// ```
#[test]
fn branch_condition_preserved() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", int_ty);
    let x = builder.place_local(x);
    let cond = builder.local("cond", bool_ty);
    let cond = builder.place_local(cond);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.input(InputOp::Load { required: true }, "input"))
        .assign_place(cond, |rv| rv.binary(x, op![==], x))
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).ret(const_1);
    builder.build_block(bb2).ret(const_2);

    let body = builder.finish(0, int_ty);

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
///
/// ```text
/// bb0:
///   StorageLive(dead)
///   x = input
///   dead = 42        // dead assignment
///   StorageDead(dead)
///   return x
/// ```
///
/// Both the assignment and storage markers for dead locals should be eliminated.
#[test]
fn dead_storage_statements() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let x = builder.place_local(x);
    let dead = builder.local("dead", ty);
    let const_42 = builder.const_int(42);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .storage_live(dead)
        .assign_place(x, |rv| rv.input(InputOp::Load { required: true }, "input"))
        .assign_local(dead, |rv| rv.load(const_42))
        .storage_dead(dead)
        .ret(x);

    let body = builder.finish(0, ty);

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
///
/// ```text
/// bb0:
///   cond = input
///   if cond -> bb1 else bb2
/// bb1:
///   goto bb3(1, 10)
/// bb2:
///   goto bb3(2, 20)
/// bb3(dead, live):
///   return live
/// ```
///
/// Both bb1 and bb2 must have their first argument removed.
#[test]
fn dead_param_multiple_predecessors() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let cond = builder.local("cond", bool_ty);
    let cond = builder.place_local(cond);
    let dead = builder.local("dead", int_ty);
    let live = builder.local("live", int_ty);

    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_10 = builder.const_int(10);
    let const_20 = builder.const_int(20);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([dead, live]);

    let live = builder.place_local(live);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| {
            rv.input(InputOp::Load { required: true }, "cond")
        })
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, [const_1, const_10]);
    builder.build_block(bb2).goto(bb3, [const_2, const_20]);

    builder.build_block(bb3).ret(live);

    let body = builder.finish(0, int_ty);

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
/// ```text
/// bb0:
///   graph_read -> bb1(token)
/// bb1(token):      // token must be preserved (side effect)
///   dead = 42      // dead - not used
///   return 0
/// ```
///
/// The graph read token is a root use because eliminating it would remove a side effect.
#[test]
fn graph_read_token_preserved() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let token_ty =
        TypeBuilder::synthetic(&env).opaque("GraphToken", TypeBuilder::synthetic(&env).unknown());

    let axis = builder.local("axis", TypeBuilder::synthetic(&env).unknown());
    let axis = builder.place_local(axis);

    let token = builder.local("token", token_ty);
    let dead = builder.local("dead", int_ty);

    let const_0 = builder.const_int(0);
    let const_42 = builder.const_int(42);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([token]);

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
        .assign_local(dead, |rv| rv.load(const_42))
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
