#![expect(clippy::min_ident_chars, reason = "tests")]

use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::{CollectIn, FromIteratorIn as _, Heap, Scratch},
    id::IdVec,
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{AdministrativeReduction, kind::ReductionKind};
use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        operand::Operand,
        rvalue::{Aggregate, AggregateKind, RValue},
        statement::{Assign, Statement, StatementKind},
        terminator::{Return, TerminatorKind},
    },
    builder::{BodyBuilder, op, scaffold},
    context::MirContext,
    def::{DefId, DefIdSlice},
    pass::{Changed, GlobalTransformPass as _, TransformPass as _},
    pretty::TextFormat,
};

// =============================================================================
// Test Helpers
// =============================================================================

/// Helper to set a body's DefId for multi-body test scenarios.
fn with_def_id(mut body: Body<'_>, id: DefId) -> Body<'_> {
    body.id = id;
    body
}

// =============================================================================
// Classification Tests (assertion-based)
// =============================================================================

/// Tests that a single-BB body with only Load(const) + return is classified as TrivialThunk.
#[test]
fn classify_thunk_const_return() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .ret(x);

    let body = builder.finish(0, int_ty);

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests that a body with multiple Load statements is classified as TrivialThunk.
#[test]
fn classify_thunk_load_chain() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let z = builder.local("z", int_ty);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(y, |rv| rv.load(x))
        .assign_place(z, |rv| rv.load(y))
        .ret(z);

    let body = builder.finish(0, int_ty);

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests that a body with Aggregate (struct) is classified as TrivialThunk.
#[test]
fn classify_thunk_aggregate_struct() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let struct_ty = TypeBuilder::synthetic(&env).unknown();

    let x = builder.local("x", struct_ty);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.r#struct([("a", const_1), ("b", const_2)]))
        .ret(x);

    let body = builder.finish(0, struct_ty);

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests that a body with Aggregate (tuple) is classified as TrivialThunk.
#[test]
fn classify_thunk_aggregate_tuple() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty]);

    let x = builder.local("x", tuple_ty);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.tuple([const_1, const_2]))
        .ret(x);

    let body = builder.finish(0, tuple_ty);

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests that Nop statements don't block TrivialThunk classification.
#[test]
fn classify_thunk_nop() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .nop()
        .assign_place(x, |rv| rv.load(const_1))
        .nop()
        .ret(x);

    let body = builder.finish(0, int_ty);

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests that an empty body (just returning a parameter) is classified as TrivialThunk.
#[test]
fn classify_thunk_empty() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let arg = builder.local("arg", int_ty);

    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(arg);

    let body = builder.finish(1, int_ty);

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests that a body with a single Apply + return is classified as ForwardingClosure.
#[test]
fn classify_closure_immediate() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let result = builder.local("result", int_ty);
    let fn_ptr = builder.const_fn(DefId::new(0));

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.call(fn_ptr))
        .ret(result);

    let body = builder.finish(0, int_ty);

    assert_eq!(
        ReductionKind::of(&body),
        Some(ReductionKind::ForwardingClosure)
    );
}

/// Tests that a body with trivial prelude + Apply + return is ForwardingClosure.
#[test]
fn classify_closure_prelude() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let result = builder.local("result", int_ty);
    let const_1 = builder.const_int(1);
    let fn_ptr = builder.const_fn(DefId::new(0));

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(result, |rv| rv.apply(fn_ptr, [x]))
        .ret(result);

    let body = builder.finish(0, int_ty);

    assert_eq!(
        ReductionKind::of(&body),
        Some(ReductionKind::ForwardingClosure)
    );
}

/// Tests that a body with multiple basic blocks is not reducible.
#[test]
fn classify_non_reducible_multi_bb() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let cond = builder.local("cond", bool_ty);
    let x = builder.local("x", int_ty);
    let const_true = builder.const_bool(true);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([x.local]);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.load(const_true))
        .if_else(cond, bb1, [], bb2, []);
    builder.build_block(bb1).goto(bb3, [const_1]);
    builder.build_block(bb2).goto(bb3, [const_2]);
    builder.build_block(bb3).ret(x);

    let body = builder.finish(0, int_ty);

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that a body with Binary operation is not a TrivialThunk.
#[test]
fn classify_non_reducible_binary() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", bool_ty);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(y, |rv| rv.binary(x, op![==], const_2))
        .ret(y);

    let body = builder.finish(0, bool_ty);

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that a body with Unary operation is not a TrivialThunk.
#[test]
fn classify_non_reducible_unary() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    let x = builder.local("x", bool_ty);
    let y = builder.local("y", bool_ty);
    let const_true = builder.const_bool(true);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_true))
        .assign_place(y, |rv| rv.unary(op![!], x))
        .ret(y);

    let body = builder.finish(0, bool_ty);

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that a body with StorageLive is not reducible.
#[test]
fn classify_non_reducible_storage_live() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .storage_live(x.local)
        .assign_place(x, |rv| rv.load(const_1))
        .ret(x);

    let body = builder.finish(0, int_ty);

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that a body with StorageDead is not reducible.
#[test]
fn classify_non_reducible_storage_dead() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(y, |rv| rv.load(x))
        .storage_dead(x.local)
        .ret(y);

    let body = builder.finish(0, int_ty);

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that Apply not in final statement position is not a ForwardingClosure.
#[test]
fn classify_non_reducible_call_not_last() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let fn_ptr = builder.const_fn(DefId::new(0));

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.call(fn_ptr))
        .assign_place(y, |rv| rv.load(x))
        .ret(y);

    let body = builder.finish(0, int_ty);

    // This is not a ForwardingClosure because the return value is not the call result.
    // It's also not a TrivialThunk because it has an Apply.
    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that returning something other than call result is not a ForwardingClosure.
#[test]
fn classify_non_reducible_return_mismatch() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let const_1 = builder.const_int(1);
    let fn_ptr = builder.const_fn(DefId::new(0));

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.load(const_1))
        .assign_place(y, |rv| rv.call(fn_ptr))
        .ret(x); // Returns x, not y (the call result)

    let body = builder.finish(0, int_ty);

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that multiple Apply statements block ForwardingClosure classification.
#[test]
fn classify_non_reducible_multi_call() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let y = builder.local("y", int_ty);
    let fn_ptr = builder.const_fn(DefId::new(0));

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.call(fn_ptr))
        .assign_place(y, |rv| rv.apply(fn_ptr, [x]))
        .ret(y);

    let body = builder.finish(0, int_ty);

    // First Apply makes prelude non-trivial, so not ForwardingClosure.
    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that self-recursion is blocked (body doesn't inline itself).
#[test]
fn self_recursion_blocked() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let result = builder.local("result", int_ty);
    // Body will have DefId(0), and it calls DefId(0)
    let fn_ptr = builder.const_fn(DefId::new(0));

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.call(fn_ptr))
        .ret(result);

    let mut body = builder.finish(0, int_ty);
    body.id = DefId::new(0);

    // Even though this is classified as ForwardingClosure, running the pass should not
    // cause infinite inlining because self-recursion is blocked.
    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut bodies = [body];
    let mut pass = AdministrativeReduction::new_in(Scratch::new());
    let changed = pass.run(&mut context, DefIdSlice::from_raw_mut(&mut bodies));

    // No change because the only call is self-recursive
    assert_eq!(changed, Changed::No);
}

/// Tests that after inlining, a body can be reclassified from ForwardingClosure to TrivialThunk.
#[test]
fn reclassify_closure_to_thunk() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: trivial thunk (returns const)
    let x0 = builder.local("x", int_ty);
    let const_1 = builder.const_int(1);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_1))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1: forwarding closure (calls body0)
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    // Before: body1 is ForwardingClosure
    assert_eq!(
        ReductionKind::of(&body1),
        Some(ReductionKind::ForwardingClosure)
    );

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut bodies = [body0, body1];
    let mut pass = AdministrativeReduction::new_in(Scratch::new());
    let changed = pass.run(&mut context, DefIdSlice::from_raw_mut(&mut bodies));

    assert_eq!(changed, Changed::Yes);

    // After: body1 should now be a TrivialThunk (the call was inlined)
    assert_eq!(
        ReductionKind::of(&bodies[1]),
        Some(ReductionKind::TrivialThunk)
    );
}

// =============================================================================
// Insta Snapshot Tests
// =============================================================================

#[track_caller]
fn assert_admin_reduction_pass<'heap>(
    name: &'static str,
    bodies: &mut [Body<'heap>],
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

    text_format
        .format(DefIdSlice::from_raw(bodies), &[])
        .expect("should be able to write bodies");

    let mut pass = AdministrativeReduction::new_in(Scratch::new());
    let changed = pass.run(context, DefIdSlice::from_raw_mut(bodies));

    write!(
        text_format.writer,
        "\n\n{:=^50}\n\n",
        format!(" Changed: {changed:?} ")
    )
    .expect("infallible");

    text_format
        .format(DefIdSlice::from_raw(bodies), &[])
        .expect("should be able to write bodies");

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/administrative_reduction"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    let value = text_format.writer.into_string_lossy();
    assert_snapshot!(name, value);
}

/// Tests inlining a simple trivial thunk (const return).
#[test]
fn inline_thunk_simple() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: trivial thunk returning const
    let x0 = builder.local("x", int_ty);
    let const_42 = builder.const_int(42);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_42))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1: calls body0
    let mut builder = BodyBuilder::new(&interner);
    let result = builder.local("result", int_ty);
    let fn_ptr = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result, |rv| rv.call(fn_ptr))
        .ret(result);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_thunk_simple",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests inlining a thunk with multiple parameters.
#[test]
fn inline_thunk_multi_arg() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: thunk that takes 3 args and returns a tuple
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty, int_ty]);
    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let c = builder.local("c", int_ty);
    let result0 = builder.local("result", tuple_ty);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result0, |rv| rv.tuple([a, b, c]))
        .ret(result0);
    let body0 = with_def_id(builder.finish(3, tuple_ty), DefId::new(0));

    // Body 1: calls body0 with 3 arguments
    let mut builder = BodyBuilder::new(&interner);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let result1 = builder.local("result", tuple_ty);
    let fn_ptr = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.apply(fn_ptr, [const_1, const_2, const_3]))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, tuple_ty), DefId::new(1));

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_thunk_multi_arg",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests inlining a forwarding closure.
#[test]
fn inline_closure_simple() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: trivial thunk
    let x0 = builder.local("x", int_ty);
    let const_42 = builder.const_int(42);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_42))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1: forwarding closure that calls body0
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr0))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    // Body 2: calls body1
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr1 = builder.const_fn(DefId::new(1));
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.call(fn_ptr1))
        .ret(result2);
    let body2 = with_def_id(builder.finish(0, int_ty), DefId::new(2));

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "inline_closure_simple",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests inlining a forwarding closure with trivial prelude.
#[test]
fn inline_closure_with_prelude() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: thunk that takes an arg and returns it
    let arg0 = builder.local("arg", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(arg0);
    let body0 = with_def_id(builder.finish(1, int_ty), DefId::new(0));

    // Body 1: forwarding closure with prelude (loads a const, then calls body0)
    let mut builder = BodyBuilder::new(&interner);
    let x = builder.local("x", int_ty);
    let result1 = builder.local("result", int_ty);
    let const_99 = builder.const_int(99);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(x, |rv| rv.load(const_99))
        .assign_place(result1, |rv| rv.apply(fn_ptr0, [x]))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    // Body 2: calls body1
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr1 = builder.const_fn(DefId::new(1));
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.call(fn_ptr1))
        .ret(result2);
    let body2 = with_def_id(builder.finish(0, int_ty), DefId::new(2));

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "inline_closure_with_prelude",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that caller's existing locals are preserved after inlining.
#[test]
fn offset_caller_locals() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    // Body 0: trivial thunk returning const
    let x0 = builder.local("x", int_ty);
    let const_42 = builder.const_int(42);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_42))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1: has locals before the call, then calls body0
    let mut builder = BodyBuilder::new(&interner);
    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let c = builder.local("c", bool_ty);
    let result = builder.local("result", int_ty);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let fn_ptr = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(a, |rv| rv.load(const_1))
        .assign_place(b, |rv| rv.load(const_2))
        .assign_place(c, |rv| rv.binary(a, op![==], b))
        .assign_place(result, |rv| rv.call(fn_ptr))
        .ret(result);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "offset_caller_locals",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests nested inlining: A inlines B which inlines C.
#[test]
fn offset_nested() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0 (C): trivial thunk returning const
    let x0 = builder.local("x", int_ty);
    let const_1 = builder.const_int(1);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_1))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1 (B): calls C
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr0))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    // Body 2 (A): calls B
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr1 = builder.const_fn(DefId::new(1));
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.call(fn_ptr1))
        .ret(result2);
    let body2 = with_def_id(builder.finish(0, int_ty), DefId::new(2));

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "offset_nested",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that argument RHS operands are NOT offset (they reference caller locals).
#[test]
fn offset_args_not_offset() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: thunk that takes an arg and returns it + a local
    let arg0 = builder.local("arg", int_ty);
    let local0 = builder.local("local", int_ty);
    let result0 = builder.local("result", int_ty);
    let const_10 = builder.const_int(10);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(local0, |rv| rv.load(const_10))
        .assign_place(result0, |rv| rv.load(arg0))
        .ret(result0);
    let body0 = with_def_id(builder.finish(1, int_ty), DefId::new(0));

    // Body 1: calls body0 with a local as argument
    let mut builder = BodyBuilder::new(&interner);
    let caller_local = builder.local("caller_local", int_ty);
    let result1 = builder.local("result", int_ty);
    let const_5 = builder.const_int(5);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(caller_local, |rv| rv.load(const_5))
        .assign_place(result1, |rv| rv.apply(fn_ptr0, [caller_local]))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "offset_args_not_offset",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests postorder traversal: callee is reduced before caller sees it.
#[test]
fn postorder_simple() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: trivial thunk
    let x0 = builder.local("x", int_ty);
    let const_1 = builder.const_int(1);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_1))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1: calls body0
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr0))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "postorder_simple",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests a chain of thunks: A → B → C, all reduced in one pass.
#[test]
fn postorder_chain() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0 (C): trivial thunk
    let x0 = builder.local("x", int_ty);
    let const_100 = builder.const_int(100);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_100))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1 (B): calls C
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr0))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    // Body 2 (A): calls B
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr1 = builder.const_fn(DefId::new(1));
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.call(fn_ptr1))
        .ret(result2);
    let body2 = with_def_id(builder.finish(0, int_ty), DefId::new(2));

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "postorder_chain",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests diamond call graph: A → {B, C} → D
#[test]
fn postorder_diamond() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0 (D): trivial thunk
    let x0 = builder.local("x", int_ty);
    let const_1 = builder.const_int(1);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_1))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1 (B): calls D
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr0))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    // Body 2 (C): calls D
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.call(fn_ptr0))
        .ret(result2);
    let body2 = with_def_id(builder.finish(0, int_ty), DefId::new(2));

    // Body 3 (A): calls B and C (uses result of B)
    let mut builder = BodyBuilder::new(&interner);
    let r_b = builder.local("r_b", int_ty);
    let r_c = builder.local("r_c", int_ty);
    let fn_ptr1 = builder.const_fn(DefId::new(1));
    let fn_ptr2 = builder.const_fn(DefId::new(2));
    let bb3 = builder.reserve_block([]);
    builder
        .build_block(bb3)
        .assign_place(r_b, |rv| rv.call(fn_ptr1))
        .assign_place(r_c, |rv| rv.call(fn_ptr2))
        .ret(r_b);
    let body3 = with_def_id(builder.finish(0, int_ty), DefId::new(3));

    let mut bodies = [body0, body1, body2, body3];
    assert_admin_reduction_pass(
        "postorder_diamond",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests local fixpoint: multiple reducible calls in sequence are all inlined.
#[test]
fn fixpoint_sequential() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: trivial thunk returning const 1
    let x0 = builder.local("x", int_ty);
    let const_1 = builder.const_int(1);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_1))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1: trivial thunk returning const 2
    let mut builder = BodyBuilder::new(&interner);
    let x1 = builder.local("x", int_ty);
    let const_2 = builder.const_int(2);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(x1, |rv| rv.load(const_2))
        .ret(x1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    // Body 2: calls body0, then body1
    let mut builder = BodyBuilder::new(&interner);
    let r0 = builder.local("r0", int_ty);
    let r1 = builder.local("r1", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let fn_ptr1 = builder.const_fn(DefId::new(1));
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(r0, |rv| rv.call(fn_ptr0))
        .assign_place(r1, |rv| rv.call(fn_ptr1))
        .ret(r1);
    let body2 = with_def_id(builder.finish(0, int_ty), DefId::new(2));

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "fixpoint_sequential",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that newly inserted code (from inlining) containing a reducible call is also processed.
#[test]
fn fixpoint_nested() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: trivial thunk returning const
    let x0 = builder.local("x", int_ty);
    let const_42 = builder.const_int(42);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_42))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1: forwarding closure that calls body0
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr0))
        .ret(result1);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    // Body 2: calls body1 (which when inlined, inserts a call to body0)
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr1 = builder.const_fn(DefId::new(1));
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.call(fn_ptr1))
        .ret(result2);
    let body2 = with_def_id(builder.finish(0, int_ty), DefId::new(2));

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "fixpoint_nested",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests indirect call resolution via local tracking.
#[test]
fn indirect_via_local() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let fn_ty = TypeBuilder::synthetic(&env).unknown();

    // Body 0: trivial thunk
    let x0 = builder.local("x", int_ty);
    let const_77 = builder.const_int(77);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_77))
        .ret(x0);
    let body0 = with_def_id(builder.finish(0, int_ty), DefId::new(0));

    // Body 1: stores fn ptr in local, then calls it
    let mut builder = BodyBuilder::new(&interner);
    let f = builder.local("f", fn_ty);
    let result = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(DefId::new(0));
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(f, |rv| rv.load(fn_ptr0))
        .assign_place(result, |rv| rv.call(f))
        .ret(result);
    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "indirect_via_local",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests closure tracking: closure aggregate is tracked and call is resolved.
#[test]
fn indirect_closure() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let closure_ty = TypeBuilder::synthetic(&env).unknown();

    // Body 0: trivial thunk that takes captured env as first arg
    let env_arg = builder.local("env", int_ty);
    let result0 = builder.local("result", int_ty);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result0, |rv| rv.load(env_arg))
        .ret(result0);
    let body0 = with_def_id(builder.finish(1, int_ty), DefId::new(0));

    // Body 1: creates a closure (fn_ptr, env), then calls it
    let mut builder = BodyBuilder::new(&interner);
    let captured = builder.local("captured", int_ty);
    let closure = builder.local("closure", closure_ty);
    let result1 = builder.local("result", int_ty);
    let const_55 = builder.const_int(55);
    let bb1 = builder.reserve_block([]);

    // Manually build closure aggregate since builder doesn't have a helper
    builder
        .build_block(bb1)
        .assign_place(captured, |rv| rv.load(const_55))
        .assign_place(closure, |rv| rv.closure(body0.id, captured))
        .assign_place(result1, |rv| rv.apply(closure, [captured]))
        .ret(result1);

    let body1 = with_def_id(builder.finish(0, int_ty), DefId::new(1));

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "indirect_closure",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
