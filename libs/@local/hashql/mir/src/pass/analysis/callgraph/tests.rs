#![expect(clippy::similar_names, reason = "tests")]
use std::path::PathBuf;

use hashql_core::r#type::{TypeBuilder, environment::Environment};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{CallGraph, CallGraphAnalysis};
use crate::{
    body::{Body, operand::Operand},
    builder::{BodyBuilder, scaffold},
    context::MirContext,
    def::DefId,
    pass::AnalysisPass as _,
};

#[track_caller]
fn assert_callgraph<'heap>(
    name: &'static str,
    bodies: &[Body<'heap>],
    context: &mut MirContext<'_, 'heap>,
) {
    let mut graph = CallGraph::new(crate::def::DefIdSlice::from_raw(bodies));

    for body in bodies {
        let mut analysis = CallGraphAnalysis::new(&mut graph);
        analysis.run(context, body);
    }

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/callgraph"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    assert_snapshot!(name, format!("{graph}"));
}

/// Tests that a direct function application creates an Apply edge.
///
/// ```text
/// @0:
///   _0 = apply(@1, [])
///   return _0
/// ```
#[test]
fn direct_apply() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let ty = TypeBuilder::synthetic(&env).integer();

    let result = builder.local("result", ty);

    let caller_id = DefId::new(0);
    let callee_id = DefId::new(1);
    let callee_fn = builder.const_fn(callee_id);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.apply(callee_fn, [] as [Operand<'_>; 0]))
        .ret(result);

    let mut caller = builder.finish(0, ty);
    caller.id = caller_id;

    // Create a dummy body for the callee so the domain includes it
    let mut builder = BodyBuilder::new(&interner);
    let ret = builder.local("ret", ty);
    let bb = builder.reserve_block([]);
    builder.build_block(bb).ret(ret);
    let mut callee = builder.finish(0, ty);
    callee.id = callee_id;

    assert_callgraph(
        "direct_apply",
        &[caller, callee],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that function arguments also get visited as Opaque if they contain [`DefId`].
///
/// ```text
/// @0:
///   _0 = apply(@1, [@2])  // @1 is Apply, @2 is Opaque (passed as argument)
///   return _0
/// ```
#[test]
fn apply_with_fn_argument() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let ty = TypeBuilder::synthetic(&env).integer();

    let caller_id = DefId::new(0);
    let callee_id = DefId::new(1);
    let arg_fn_id = DefId::new(2);

    let result = builder.local("result", ty);
    let callee_fn = builder.const_fn(callee_id);
    let arg_fn = builder.const_fn(arg_fn_id);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.apply(callee_fn, [arg_fn]))
        .ret(result);

    let mut caller = builder.finish(0, ty);
    caller.id = caller_id;

    // Dummy body for callee
    let mut builder = BodyBuilder::new(&interner);
    let ret = builder.local("ret", ty);
    let bb = builder.reserve_block([]);
    builder.build_block(bb).ret(ret);
    let mut callee = builder.finish(0, ty);
    callee.id = callee_id;

    // Dummy body for arg_fn
    let mut builder = BodyBuilder::new(&interner);
    let ret = builder.local("ret", ty);
    let bb = builder.reserve_block([]);
    builder.build_block(bb).ret(ret);
    let mut arg_body = builder.finish(0, ty);
    arg_body.id = arg_fn_id;

    assert_callgraph(
        "apply_with_fn_argument",
        &[caller, callee, arg_body],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that multiple calls from the same body create multiple edges.
///
/// ```text
/// @0:
///   _0 = apply(@1, [])
///   _1 = apply(@2, [])
///   return _1
/// ```
#[test]
fn multiple_calls() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let ty = TypeBuilder::synthetic(&env).integer();

    let caller_id = DefId::new(0);
    let callee1_id = DefId::new(1);
    let callee2_id = DefId::new(2);

    let x = builder.local("x", ty);
    let y = builder.local("y", ty);
    let fn1 = builder.const_fn(callee1_id);
    let fn2 = builder.const_fn(callee2_id);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.apply(fn1, [] as [Operand<'_>; 0]))
        .assign_place(y, |rv| rv.apply(fn2, [] as [Operand<'_>; 0]))
        .ret(y);

    let mut caller = builder.finish(0, ty);
    caller.id = caller_id;

    // Dummy body 1
    let mut builder = BodyBuilder::new(&interner);
    let ret = builder.local("ret", ty);
    let bb = builder.reserve_block([]);
    builder.build_block(bb).ret(ret);
    let mut body1 = builder.finish(0, ty);
    body1.id = callee1_id;

    // Dummy body 2
    let mut builder = BodyBuilder::new(&interner);
    let ret = builder.local("ret", ty);
    let bb = builder.reserve_block([]);
    builder.build_block(bb).ret(ret);
    let mut body2 = builder.finish(0, ty);
    body2.id = callee2_id;

    assert_callgraph(
        "multiple_calls",
        &[caller, body1, body2],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests call chain across multiple bodies.
///
/// ```text
/// @0 calls @1
/// @1 calls @2
/// ```
#[test]
fn call_chain() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let ty = TypeBuilder::synthetic(&env).integer();

    let outer_id = DefId::new(0);
    let middle_id = DefId::new(1);
    let leaf_id = DefId::new(2);

    // Outer body: calls middle
    let x = builder.local("x", ty);
    let middle_fn = builder.const_fn(middle_id);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.apply(middle_fn, [] as [Operand<'_>; 0]))
        .ret(x);
    let mut outer = builder.finish(0, ty);
    outer.id = outer_id;

    // Middle body: calls leaf
    let mut builder = BodyBuilder::new(&interner);
    let y = builder.local("y", ty);
    let leaf_fn = builder.const_fn(leaf_id);
    let bb1 = builder.reserve_block([]);
    builder
        .build_block(bb1)
        .assign_place(y, |rv| rv.apply(leaf_fn, [] as [Operand<'_>; 0]))
        .ret(y);
    let mut middle = builder.finish(0, ty);
    middle.id = middle_id;

    // Leaf body: no calls
    let mut builder = BodyBuilder::new(&interner);
    let z = builder.local("z", ty);
    let bb2 = builder.reserve_block([]);
    builder.build_block(bb2).ret(z);
    let mut leaf = builder.finish(0, ty);
    leaf.id = leaf_id;

    assert_callgraph(
        "call_chain",
        &[outer, middle, leaf],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests recursive call (self-reference).
///
/// ```text
/// @0 calls @0
/// ```
#[test]
fn recursive_call() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let ty = TypeBuilder::synthetic(&env).integer();

    let recursive_id = DefId::new(0);

    let x = builder.local("x", ty);
    let self_fn = builder.const_fn(recursive_id);
    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.apply(self_fn, [] as [Operand<'_>; 0]))
        .ret(x);

    let mut body = builder.finish(0, ty);
    body.id = recursive_id;

    assert_callgraph(
        "recursive_call",
        &[body],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that indirect calls (via local) are tracked as Opaque at assignment, not Apply.
///
/// ```text
/// @0:
///   _0 = @1         // Opaque edge here
///   _1 = apply(_0)  // No edge here (function is a local, not a DefId)
///   return _1
/// ```
#[test]
fn indirect_call_via_local() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let ty = TypeBuilder::synthetic(&env).integer();
    let fn_ty = TypeBuilder::synthetic(&env).unknown();

    let caller_id = DefId::new(0);
    let callee_id = DefId::new(1);

    let func_local = builder.local("func", fn_ty);
    let result = builder.local("result", ty);
    let fn_const = builder.const_fn(callee_id);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(func_local, |rv| rv.load(fn_const))
        .assign_place(result, |rv| rv.apply(func_local, [] as [Operand<'_>; 0]))
        .ret(result);

    let mut caller = builder.finish(0, ty);
    caller.id = caller_id;

    // Dummy callee body
    let mut builder = BodyBuilder::new(&interner);
    let ret = builder.local("ret", ty);
    let bb = builder.reserve_block([]);
    builder.build_block(bb).ret(ret);
    let mut callee = builder.finish(0, ty);
    callee.id = callee_id;

    assert_callgraph(
        "indirect_call_via_local",
        &[caller, callee],
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
