#![expect(clippy::min_ident_chars, reason = "tests")]

use std::{io::Write as _, path::PathBuf};

use bstr::ByteVec as _;
use hashql_core::{
    heap::Scratch,
    pretty::Formatter,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, TypeId, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{AdministrativeReduction, kind::ReductionKind};
use crate::{
    body::Body,
    builder::{BodyBuilder, op, scaffold},
    context::MirContext,
    def::{DefId, DefIdSlice},
    pass::{Changed, GlobalTransformPass as _},
    pretty::TextFormat,
};

/// Tests `TrivialThunk` classification for an identity function (returns parameter).
///
/// ```text
/// fn body0(%0: Int) -> Int {
///   bb0:
///     return %0
/// }
/// ```
#[test]
fn classify_thunk_identity() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let arg = builder.local("arg", int_ty);

    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(arg);

    let body = builder.finish(1, int_ty);

    assert_eq!(ReductionKind::of(&body), Some(ReductionKind::TrivialThunk));
}

/// Tests `TrivialThunk` classification for a body with Aggregate.
///
/// ```text
/// fn body0() -> (a: Int, b: Int) {
///   bb0:
///     %0 = (a: 1, b: 2)
///     return %0
/// }
/// ```
#[test]
fn classify_thunk_aggregate() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let struct_ty = TypeBuilder::synthetic(&env).r#struct([("a", int_ty), ("b", int_ty)]);

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

/// Tests `ForwardingClosure` classification for a body with single Apply + return.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = apply fn@0
///     return %0
/// }
/// ```
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

/// Tests that a body with multiple basic blocks (control flow) is not reducible.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = true
///     switchInt(%0) -> [0: bb2, 1: bb1]
///   bb1:
///     goto bb3(1)
///   bb2:
///     goto bb3(2)
///   bb3(%1):
///     return %1
/// }
/// ```
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

/// Tests that a body with non-trivial operations (Binary, Unary, etc.) is not reducible.
///
/// ```text
/// fn body0() -> Boolean {
///   bb0:
///     %0 = 1
///     %1 = %0 == 2
///     return %1
/// }
/// ```
#[test]
fn classify_non_reducible_non_trivial_op() {
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

/// Tests that Apply not in final statement position is not a `ForwardingClosure`.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = apply fn@0
///     %1 = %0           // <-- final statement is Load, not Apply
///     return %1
/// }
/// ```
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

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that returning something other than the call result is not a `ForwardingClosure`.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = 1
///     %1 = apply fn@0
///     return %0         // <-- returns %0, not %1 (the call result)
/// }
/// ```
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
        .ret(x);

    let body = builder.finish(0, int_ty);

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that multiple Apply statements block `ForwardingClosure` classification.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = apply fn@0   // <-- first Apply makes prelude non-trivial
///     %1 = apply fn@0 %0
///     return %1
/// }
/// ```
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

    assert_eq!(ReductionKind::of(&body), None);
}

/// Tests that self-recursion is blocked (body doesn't inline itself).
///
/// ```text
/// fn body0@0() -> Int {
///   bb0:
///     %0 = apply fn@0  // <-- calls itself
///     return %0
/// }
/// ```
///
/// Even though this is classified as `ForwardingClosure`, running the pass should
/// not cause infinite inlining because self-recursion is blocked.
#[test]
fn self_recursion_blocked() {
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

    let mut body = builder.finish(0, int_ty);
    body.id = DefId::new(0);

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut bodies = [body];
    let mut pass = AdministrativeReduction::new_in(Scratch::new());
    let changed = pass.run(&mut context, DefIdSlice::from_raw_mut(&mut bodies));

    assert_eq!(changed, Changed::No);
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

/// Tests inlining a simple trivial thunk that returns a constant.
///
/// Before:
/// ```text
/// fn body0@0() -> Int {   // TrivialThunk
///   bb0:
///     %0 = 42
///     return %0
/// }
///
/// fn body1@1() -> Int {
///   bb0:
///     %0 = apply fn@0
///     return %0
/// }
/// ```
///
/// After: body1 has body0's statements inlined, call replaced with load.
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: calls body0
    let mut builder = BodyBuilder::new(&interner);
    let result = builder.local("result", int_ty);
    let fn_ptr = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result, |rv| rv.call(fn_ptr))
        .ret(result);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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
///
/// Before:
/// ```text
/// fn body0(%0: Int, %1: Int, %2: Int) -> (Int, Int, Int) {
///     bb0:
///         %3 = (%0, %1, %2)
///         return %3
/// }
///
/// fn body1() -> (Int, Int, Int) {
///     bb0:
///         %0 = call fn@0(1, 2, 3)
///         return %0
/// }
/// ```
///
/// After: body1 has param bindings + body0's statements inlined.
#[test]
fn inline_thunk_multi_arg() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty, int_ty]);

    // Body 0: thunk that takes 3 args and returns a tuple
    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let c = builder.local("c", int_ty);
    let result0 = builder.local("result", tuple_ty);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result0, |rv| rv.tuple([a, b, c]))
        .ret(result0);
    let mut body0 = builder.finish(3, tuple_ty);
    body0.id = DefId::new(0);

    // Body 1: calls body0 with 3 arguments
    let mut builder = BodyBuilder::new(&interner);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let result1 = builder.local("result", tuple_ty);
    let fn_ptr = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.apply(fn_ptr, [const_1, const_2, const_3]))
        .ret(result1);
    let mut body1 = builder.finish(0, tuple_ty);
    body1.id = DefId::new(1);

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

/// Tests inlining a forwarding closure with a trivial prelude.
///
/// Before:
/// ```text
/// fn body0@0(%0: Int) -> Int {   // Identity thunk
///   bb0:
///     return %0
/// }
///
/// fn body1@1() -> Int {   // ForwardingClosure with prelude
///   bb0:
///     %0 = 99
///     %1 = apply fn@0 %0
///     return %1
/// }
///
/// fn body2@2() -> Int {   // Calls body1
///   bb0:
///     %0 = apply fn@1
///     return %0
/// }
/// ```
///
/// After: All calls inlined with prelude statements preserved.
#[test]
fn inline_closure_with_prelude() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: thunk that takes an arg and returns it
    let arg0 = builder.local("arg", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(arg0);
    let mut body0 = builder.finish(1, int_ty);
    body0.id = DefId::new(0);

    // Body 1: forwarding closure with prelude (loads a const, then calls body0)
    let mut builder = BodyBuilder::new(&interner);
    let x = builder.local("x", int_ty);
    let result1 = builder.local("result", int_ty);
    let const_99 = builder.const_int(99);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(x, |rv| rv.load(const_99))
        .assign_place(result1, |rv| rv.apply(fn_ptr0, [x]))
        .ret(result1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

    // Body 2: calls body1
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr1 = builder.const_fn(body1.id);
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.call(fn_ptr1))
        .ret(result2);
    let mut body2 = builder.finish(0, int_ty);
    body2.id = DefId::new(2);

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

/// Tests that argument RHS operands are NOT offset (they reference caller locals).
///
/// Before:
/// ```text
/// fn body0@0(%0: Int) -> Int {   // Takes arg, returns it
///     bb0:
///         %1 = 10
///         %2 = %0
///         return %2
/// }
///
/// fn body1@1() -> Int {
///     bb0:
///         %0 = 5            // caller_local
///         %1 = call fn@0(%0)  // passes caller_local as arg
///         return %1
/// }
/// ```
///
/// After: The param binding `%2 = %0` uses caller's %0, NOT offset.
#[test]
fn inline_args_not_offset() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body 0: thunk that takes an arg, has a local, and returns the arg
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
    let mut body0 = builder.finish(1, int_ty);
    body0.id = DefId::new(0);

    // Body 1: calls body0 with a local as argument
    let mut builder = BodyBuilder::new(&interner);
    let caller_local = builder.local("caller_local", int_ty);
    let result1 = builder.local("result", int_ty);
    let const_5 = builder.const_int(5);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(caller_local, |rv| rv.load(const_5))
        .assign_place(result1, |rv| rv.apply(fn_ptr0, [caller_local]))
        .ret(result1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_args_not_offset",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests diamond call graph: body3 → {body1, body2} → body0.
///
/// ```text
/// fn body0@0() -> Int {   // D: TrivialThunk (leaf)
///   bb0:
///     %0 = 1
///     return %0
/// }
///
/// fn body1@1() -> Int {   // B: Calls D
///   bb0:
///     %0 = apply fn@0
///     return %0
/// }
///
/// fn body2@2() -> Int {   // C: Calls D
///   bb0:
///     %0 = apply fn@0
///     return %0
/// }
///
/// fn body3@3() -> Int {   // A: Calls B and C
///   bb0:
///     %0 = apply fn@1
///     %1 = apply fn@2
///     return %0
/// }
/// ```
#[test]
fn inline_diamond() {
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1 (B): calls D
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr0))
        .ret(result1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

    // Body 2 (C): calls D
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.call(fn_ptr0))
        .ret(result2);
    let mut body2 = builder.finish(0, int_ty);
    body2.id = DefId::new(2);

    // Body 3 (A): calls B and C
    let mut builder = BodyBuilder::new(&interner);
    let r_b = builder.local("r_b", int_ty);
    let r_c = builder.local("r_c", int_ty);
    let fn_ptr1 = builder.const_fn(body1.id);
    let fn_ptr2 = builder.const_fn(body2.id);
    let bb3 = builder.reserve_block([]);
    builder
        .build_block(bb3)
        .assign_place(r_b, |rv| rv.call(fn_ptr1))
        .assign_place(r_c, |rv| rv.call(fn_ptr2))
        .ret(r_b);
    let mut body3 = builder.finish(0, int_ty);
    body3.id = DefId::new(3);

    let mut bodies = [body0, body1, body2, body3];
    assert_admin_reduction_pass(
        "inline_diamond",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that multiple reducible calls in sequence are all inlined.
///
/// ```text
/// fn body0@0() -> Int {   // TrivialThunk returning 1
///   bb0:
///     %0 = 1
///     return %0
/// }
///
/// fn body1@1() -> Int {   // TrivialThunk returning 2
///   bb0:
///     %0 = 2
///     return %0
/// }
///
/// fn body2@2() -> Int {   // Calls body0, then body1
///   bb0:
///     %0 = apply fn@0
///     %1 = apply fn@1
///     return %1
/// }
/// ```
///
/// Both calls should be inlined via statement index rewind.
#[test]
fn inline_sequential_calls() {
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: trivial thunk returning const 2
    let mut builder = BodyBuilder::new(&interner);
    let x1 = builder.local("x", int_ty);
    let const_2 = builder.const_int(2);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(x1, |rv| rv.load(const_2))
        .ret(x1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

    // Body 2: calls body0, then body1
    let mut builder = BodyBuilder::new(&interner);
    let r0 = builder.local("r0", int_ty);
    let r1 = builder.local("r1", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let fn_ptr1 = builder.const_fn(body1.id);
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(r0, |rv| rv.call(fn_ptr0))
        .assign_place(r1, |rv| rv.call(fn_ptr1))
        .ret(r1);
    let mut body2 = builder.finish(0, int_ty);
    body2.id = DefId::new(2);

    let mut bodies = [body0, body1, body2];
    assert_admin_reduction_pass(
        "inline_sequential_calls",
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
///
/// ```text
/// fn body0@0() -> Int {   // TrivialThunk
///   bb0:
///     %0 = 77
///     return %0
/// }
///
/// fn body1@1() -> Int {
///   bb0:
///     %0 = fn@0         // store fn ptr in local
///     %1 = apply %0     // call via local
///     return %1
/// }
/// ```
///
/// The pass tracks that %0 holds fn@0 and resolves the indirect call.
#[test]
fn inline_indirect_via_local() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let fn_ty = TypeBuilder::synthetic(&env).closure([] as [TypeId; 0], int_ty);

    // Body 0: trivial thunk
    let x0 = builder.local("x", int_ty);
    let const_77 = builder.const_int(77);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x0, |rv| rv.load(const_77))
        .ret(x0);
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: stores fn ptr in local, then calls it
    let mut builder = BodyBuilder::new(&interner);
    let f = builder.local("f", fn_ty);
    let result = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(f, |rv| rv.load(fn_ptr0))
        .assign_place(result, |rv| rv.call(f))
        .ret(result);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_indirect_via_local",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests closure aggregate tracking: `closure (fn_ptr, env)` is tracked and call is resolved.
///
/// ```text
/// fn body0@0(%0: Int) -> Int {   // Takes captured env, returns it
///   bb0:
///     %1 = %0
///     return %1
/// }
///
/// fn body1@1() -> Int {
///   bb0:
///     %0 = 55                    // captured value
///     %1 = Closure(fn@0, %0)     // create closure
///     %2 = apply %1 (%0)         // call closure with captured env
///     return %2
/// }
/// ```
#[test]
fn inline_indirect_closure() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let closure_ty = TypeBuilder::synthetic(&env).closure([int_ty], int_ty);

    // Body 0: trivial thunk that takes captured env as first arg
    let env_arg = builder.local("env", int_ty);
    let result0 = builder.local("result", int_ty);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result0, |rv| rv.load(env_arg))
        .ret(result0);
    let mut body0 = builder.finish(1, int_ty);
    body0.id = DefId::new(0);

    // Body 1: creates a closure (fn_ptr, env), then calls it
    let mut builder = BodyBuilder::new(&interner);
    let captured = builder.local("captured", int_ty);
    let closure = builder.local("closure", closure_ty);
    let result1 = builder.local("result", int_ty);
    let const_55 = builder.const_int(55);
    let bb1 = builder.reserve_block([]);

    builder
        .build_block(bb1)
        .assign_place(captured, |rv| rv.load(const_55))
        .assign_place(closure, |rv| rv.closure(body0.id, captured))
        .assign_place(result1, |rv| rv.apply(closure, [captured]))
        .ret(result1);

    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

    let mut bodies = [body0, body1];
    assert_admin_reduction_pass(
        "inline_indirect_closure",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
