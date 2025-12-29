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

use super::{AdministrativeReduction, kind::ReductionKind};
use crate::{
    body::Body,
    builder::{BodyBuilder, op, scaffold},
    context::MirContext,
    def::{DefId, DefIdSlice},
    pass::{Changed, GlobalTransformPass as _},
    pretty::TextFormat,
};

/// Tests TrivialThunk classification for a body that loads a constant and returns it.
///
/// ```text
/// fn body0() -> Int {
///     bb0:
///         %0 = 1
///         return %0
/// }
/// ```
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

/// Tests TrivialThunk classification for a body with multiple Load statements.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = 1
///     %1 = %0
///     %2 = %1
///     return %2
/// }
/// ```
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

/// Tests TrivialThunk classification for a body with struct Aggregate.
///
/// ```text
/// fn body0() -> (a: Int, b: Int) {
///   bb0:
///     %0 = (a: 1, b: 2)
///     return %0
/// }
/// ```
#[test]
fn classify_thunk_aggregate_struct() {
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

/// Tests TrivialThunk classification for a body with tuple Aggregate.
///
/// ```text
/// fn body0() -> (Int, Int) {
///   bb0:
///     %0 = (1, 2)
///     return %0
/// }
/// ```
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
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     nop
///     %0 = 1
///     nop
///     return %0
/// }
/// ```
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

/// Tests TrivialThunk classification for an identity function (returns parameter).
///
/// ```text
/// fn body0(%0: Int) -> Int {
///   bb0:
///     return %0
/// }
/// ```
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

/// Tests ForwardingClosure classification for a body with single Apply + return.
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

/// Tests ForwardingClosure classification with trivial prelude before call.
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = 1
///     %1 = apply fn@0 %0
///     return %1
/// }
/// ```
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

/// Tests that a body with Binary operation is not reducible.
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

/// Tests that a body with Unary operation is not reducible.
///
/// ```text
/// fn body0() -> Boolean {
///   bb0:
///     %0 = true
///     %1 = !%0
///     return %1
/// }
/// ```
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
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     let %0
///     %0 = 1
///     return %0
/// }
/// ```
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
///
/// ```text
/// fn body0() -> Int {
///   bb0:
///     %0 = 1
///     %1 = %0
///     drop %0
///     return %1
/// }
/// ```
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

/// Tests that returning something other than the call result is not a ForwardingClosure.
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

/// Tests that multiple Apply statements block ForwardingClosure classification.
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
/// Even though this is classified as ForwardingClosure, running the pass should
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

/// Tests reclassification: after inlining, a ForwardingClosure becomes TrivialThunk.
///
/// Before:
/// ```text
/// fn body0@0() -> Int {   // TrivialThunk
///   bb0:
///     %0 = 1
///     return %0
/// }
///
/// fn body1@1() -> Int {   // ForwardingClosure (calls body0)
///   bb0:
///     %0 = call fn@0()
///     return %0
/// }
/// ```
///
/// After inlining body0 into body1:
/// ```text
/// fn body1@1() -> Int {   // Now TrivialThunk (no more calls)
///   bb0:
///     %1 = 1        // inlined from body0
///     %0 = %1
///     return %0
/// }
/// ```
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: forwarding closure (calls body0)
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.call(fn_ptr))
        .ret(result1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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

/// Tests inlining a chain of forwarding closures: body2 → body1 → body0.
///
/// Before:
/// ```text
/// fn body0@0() -> Int {   // TrivialThunk
///   bb0:
///     %0 = 42
///     return %0
/// }
///
/// fn body1() -> Int {   // ForwardingClosure
///   bb0:
///     %0 = apply fn@0
///     return %0
/// }
///
/// fn body2() -> Int {
///   bb0:
///     %0 = call fn@1
///     return %0
/// }
/// ```
///
/// After: All calls inlined, body2 ends up with just loads.
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: forwarding closure that calls body0
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
/// fn body2() -> Int {   // Calls body1
///   bb0:
///     %0 = apply fn@1
///     return %0
/// }
/// ```
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
        .assign_place(result1, |rv| rv.apply(fn_ptr0, [x.into()]))
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
        .assign_place(result2, |rv| rv.apply(fn_ptr1, []))
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

/// Tests that caller's existing locals are preserved and callee locals are offset.
///
/// Before:
/// ```text
/// fn body0@0() -> Int {   // TrivialThunk
///   bb0:
///     %0 = 42
///     return %0
/// }
///
/// fn body1() -> Int {
///   bb0:
///     %0 = 1
///     %1 = 2
///     %2 = %0 == %1
///     %3 = apply fn@0
///     return %3
/// }
/// ```
///
/// After: body0's %0 becomes body1's %4 (offset by 4).
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: has locals before the call, then calls body0
    let mut builder = BodyBuilder::new(&interner);
    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let c = builder.local("c", bool_ty);
    let result = builder.local("result", int_ty);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let fn_ptr = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(a, |rv| rv.load(const_1))
        .assign_place(b, |rv| rv.load(const_2))
        .assign_place(c, |rv| rv.binary(a, op![==], b))
        .assign_place(result, |rv| rv.call(fn_ptr))
        .ret(result);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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

/// Tests nested inlining: body2 → body1 → body0, with cumulative local offsets.
///
/// Before:
/// ```text
/// fn body0() -> Int {   // TrivialThunk
///     bb0:
///         %0 = 1
///         return %0
/// }
///
/// fn body1() -> Int {   // ForwardingClosure → body0
///     bb0:
///         %0 = call fn@0()
///         return %0
/// }
///
/// fn body2() -> Int {   // Calls body1
///     bb0:
///         %0 = call fn@1()
///         return %0
/// }
/// ```
///
/// After: All inlined with correct cumulative offsets.
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1 (B): calls C
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.apply(fn_ptr0, []))
        .ret(result1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

    // Body 2 (A): calls B
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr1 = builder.const_fn(body1.id);
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.apply(fn_ptr1, []))
        .ret(result2);
    let mut body2 = builder.finish(0, int_ty);
    body2.id = DefId::new(2);

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
///
/// Before:
/// ```text
/// fn body0(%0: Int) -> Int {   // Takes arg, returns it
///     bb0:
///         %1 = 10
///         %2 = %0
///         return %2
/// }
///
/// fn body1() -> Int {
///     bb0:
///         %0 = 5            // caller_local
///         %1 = call fn@0(%0)  // passes caller_local as arg
///         return %1
/// }
/// ```
///
/// After: The param binding `%2 = %0` uses caller's %0, NOT offset.
#[test]
fn offset_args_not_offset() {
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
        .assign_place(result1, |rv| rv.apply(fn_ptr0, [caller_local.into()]))
        .ret(result1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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

/// Tests postorder traversal: callee (body0) is processed before caller (body1).
///
/// ```text
/// fn body0() -> Int {   // TrivialThunk, processed first
///     bb0:
///         %0 = 1
///         return %0
/// }
///
/// fn body1() -> Int {   // Calls body0, processed second
///     bb0:
///         %0 = call fn@0()
///         return %0
/// }
/// ```
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: calls body0
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.apply(fn_ptr0, []))
        .ret(result1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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

/// Tests a chain of thunks: body2 → body1 → body0, all reduced in one pass.
///
/// ```text
/// fn body0() -> Int {   // C: TrivialThunk
///     bb0:
///         %0 = 100
///         return %0
/// }
///
/// fn body1() -> Int {   // B: ForwardingClosure → C
///     bb0:
///         %0 = call fn@0()
///         return %0
/// }
///
/// fn body2() -> Int {   // A: Calls B
///     bb0:
///         %0 = call fn@1()
///         return %0
/// }
/// ```
///
/// Postorder: C first, then B (inlines C, becomes thunk), then A (inlines B).
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1 (B): calls C
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.apply(fn_ptr0, []))
        .ret(result1);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

    // Body 2 (A): calls B
    let mut builder = BodyBuilder::new(&interner);
    let result2 = builder.local("result", int_ty);
    let fn_ptr1 = builder.const_fn(body1.id);
    let bb2 = builder.reserve_block([]);
    builder
        .build_block(bb2)
        .assign_place(result2, |rv| rv.apply(fn_ptr1, []))
        .ret(result2);
    let mut body2 = builder.finish(0, int_ty);
    body2.id = DefId::new(2);

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

/// Tests diamond call graph: body3 → {body1, body2} → body0
///
/// ```text
/// fn body0() -> Int {   // D: TrivialThunk (leaf)
///     bb0:
///         %0 = 1
///         return %0
/// }
///
/// fn body1() -> Int {   // B: Calls D
///     bb0:
///         %0 = call fn@0()
///         return %0
/// }
///
/// fn body2() -> Int {   // C: Calls D
///     bb0:
///         %0 = call fn@0()
///         return %0
/// }
///
/// fn body3() -> Int {   // A: Calls B and C
///     bb0:
///         %0 = call fn@1()
///         %1 = call fn@2()
///         return %0
/// }
/// ```
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1 (B): calls D
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.apply(fn_ptr0, []))
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
        .assign_place(result2, |rv| rv.apply(fn_ptr0, []))
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
        .assign_place(r_b, |rv| rv.apply(fn_ptr1, []))
        .assign_place(r_c, |rv| rv.apply(fn_ptr2, []))
        .ret(r_b);
    let mut body3 = builder.finish(0, int_ty);
    body3.id = DefId::new(3);

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
///
/// ```text
/// fn body0() -> Int {   // TrivialThunk returning 1
///     bb0:
///         %0 = 1
///         return %0
/// }
///
/// fn body1() -> Int {   // TrivialThunk returning 2
///     bb0:
///         %0 = 2
///         return %0
/// }
///
/// fn body2() -> Int {   // Calls body0, then body1
///     bb0:
///         %0 = call fn@0()
///         %1 = call fn@1()
///         return %1
/// }
/// ```
///
/// Both calls should be inlined via statement index rewind.
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
        .assign_place(r0, |rv| rv.apply(fn_ptr0, []))
        .assign_place(r1, |rv| rv.apply(fn_ptr1, []))
        .ret(r1);
    let mut body2 = builder.finish(0, int_ty);
    body2.id = DefId::new(2);

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

/// Tests that newly inserted code (from inlining) containing a reducible call is processed.
///
/// ```text
/// fn body0() -> Int {   // TrivialThunk
///     bb0:
///         %0 = 42
///         return %0
/// }
///
/// fn body1() -> Int {   // ForwardingClosure → body0
///     bb0:
///         %0 = call fn@0()
///         return %0
/// }
///
/// fn body2() -> Int {   // Calls body1
///     bb0:
///         %0 = call fn@1()
///         return %0
/// }
/// ```
///
/// When body1 is inlined into body2, the `call fn@0()` statement is inserted.
/// The rewind mechanism should catch this and inline body0 too.
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
    let mut body0 = builder.finish(0, int_ty);
    body0.id = DefId::new(0);

    // Body 1: forwarding closure that calls body0
    let mut builder = BodyBuilder::new(&interner);
    let result1 = builder.local("result", int_ty);
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(result1, |rv| rv.apply(fn_ptr0, []))
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
        .assign_place(result2, |rv| rv.apply(fn_ptr1, []))
        .ret(result2);
    let mut body2 = builder.finish(0, int_ty);
    body2.id = DefId::new(2);

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
///
/// ```text
/// fn body0() -> Int {   // TrivialThunk
///     bb0:
///         %0 = 77
///         return %0
/// }
///
/// fn body1() -> Int {
///     bb0:
///         %0 = fn@0     // store fn ptr in local
///         %1 = call %0() // call via local
///         return %1
/// }
/// ```
///
/// The pass tracks that %0 holds fn@0 and resolves the indirect call.
#[test]
fn indirect_via_local() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let fn_ty = TypeBuilder::synthetic(&env).closure([] as [_; 0], int_ty);

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
        .assign_place(result, |rv| rv.apply(f, []))
        .ret(result);
    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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

/// Tests closure aggregate tracking: closure (fn_ptr, env) is tracked and call is resolved.
///
/// ```text
/// fn body0(%0: Int) -> Int {   // Takes captured env, returns it
///     bb0:
///         %1 = %0
///         return %1
/// }
///
/// fn body1() -> Int {
///     bb0:
///         %0 = 55                    // captured value
///         %1 = Closure(fn@0, %0)     // create closure
///         %2 = call %1(%0)           // call closure with captured env
///         return %2
/// }
/// ```
#[test]
fn indirect_closure() {
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
    let fn_ptr0 = builder.const_fn(body0.id);
    let bb1 = builder.reserve_block([]);

    // Build the block with a manual closure aggregate
    builder
        .build_block(bb1)
        .assign_place(captured, |rv| rv.load(const_55))
        .assign(
            |pb| pb.local(closure.local),
            |_rv| {
                RValue::Aggregate(Aggregate {
                    kind: AggregateKind::Closure,
                    operands: IdVec::from_iter_in([fn_ptr0, Operand::Place(captured)], &heap),
                })
            },
        )
        .assign_place(result1, |rv| rv.apply(closure, [captured.into()]))
        .ret(result1);

    let mut body1 = builder.finish(0, int_ty);
    body1.id = DefId::new(1);

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
