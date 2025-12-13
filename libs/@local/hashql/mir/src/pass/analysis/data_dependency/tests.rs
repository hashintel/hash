#![expect(clippy::min_ident_chars, reason = "tests")]
use std::path::PathBuf;

use hashql_core::r#type::{TypeBuilder, environment::Environment};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::node::operation::InputOp;
use insta::{Settings, assert_snapshot};

use super::DataDependencyAnalysis;
use crate::{body::Body, context::MirContext, pass::AnalysisPass as _, scaffold};

#[track_caller]
fn assert_data_dependency<'heap>(
    name: &'static str,
    body: &Body<'heap>,
    context: &mut MirContext<'_, 'heap>,
) {
    let mut analysis = DataDependencyAnalysis::new();
    analysis.run(context, body);
    let graph = analysis.finish();
    let transient = graph.transient(context.interner);

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/data-dependency"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();

    assert_snapshot!(name, format!("{graph}\n\n=====\n\n{transient}"));
}

/// Tests that a simple load creates a Load edge.
///
/// ```text
/// _0 = input
/// _1 = _0  // Load edge: _1 -> _0
/// return _1
/// ```
#[test]
fn load_simple() {
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

    assert_data_dependency(
        "load_simple",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that chained loads create a chain of Load edges.
///
/// ```text
/// _0 = input
/// _1 = _0  // Load edge: _1 -> _0
/// _2 = _1  // Load edge: _2 -> _1
/// return _2
/// ```
#[test]
fn load_chain() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", ty);
    let x = builder.place_local(x);
    let y = builder.local("y", ty);
    let y = builder.place_local(y);
    let z = builder.local("z", ty);
    let z = builder.place_local(z);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(x, |rv| rv.input(InputOp::Load { required: true }, "input"))
        .assign_place(y, |rv| rv.load(x))
        .assign_place(z, |rv| rv.load(y))
        .ret(z);

    let body = builder.finish(0, ty);

    assert_data_dependency(
        "load_chain",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that load with projection creates edge with projection data.
///
/// ```text
/// _0 = input (tuple)
/// _1 = _0.0  // Load edge with .0 projection: _1 -> _0
/// return _1
/// ```
#[test]
fn load_with_projection() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let tuple_ty = TypeBuilder::synthetic(&env).tuple([
        TypeBuilder::synthetic(&env).integer(),
        TypeBuilder::synthetic(&env).integer(),
    ]);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let tup = builder.local("tup", tuple_ty);
    let elem = builder.local("elem", int_ty);
    let elem = builder.place_local(elem);

    let tup_field_0 = builder.place(|place| place.local(tup).field(0, int_ty));

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(tup, |rv| {
            rv.input(InputOp::Load { required: true }, "input")
        })
        .assign_place(elem, |rv| rv.load(tup_field_0))
        .ret(elem);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "load_with_projection",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that an alias (load) followed by projection resolves through the load.
///
/// ```text
/// _0 = (input_a, input_b)  // tuple with Index edges
/// _1 = _0                   // Load edge: _1 -> _0
/// _2 = _1.0                 // Load edge with .0 projection: _2 -> _1
/// return _2
/// ```
///
/// When resolving `_2`, we should follow through the Load to `_0`, then resolve `.0` to `input_a`.
#[test]
fn load_then_projection() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty]);

    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let tup = builder.local("tup", tuple_ty);
    let alias = builder.local("alias", tuple_ty);
    let result = builder.local("result", int_ty);
    let result = builder.place_local(result);

    let a_place = builder.place_local(a);
    let b_place = builder.place_local(b);
    let tup_place = builder.place_local(tup);
    let alias_field_0 = builder.place(|place| place.local(alias).field(0, int_ty));

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(a, |rv| rv.input(InputOp::Load { required: true }, "a"))
        .assign_local(b, |rv| rv.input(InputOp::Load { required: true }, "b"))
        .assign_local(tup, |rv| rv.tuple([a_place, b_place]))
        .assign_local(alias, |rv| rv.load(tup_place))
        .assign_place(result, |rv| rv.load(alias_field_0))
        .ret(result);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "load_then_projection",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that nested projections resolve correctly through edge projections.
///
/// When a tuple element is constructed from a place with projections (e.g., `a.field`),
/// accessing that element should prepend the edge's projections to any remaining projections.
///
/// ```text
/// _0 = input (nested tuple: ((int, int), int))
/// _1 = (_0.0, other)         // tuple with Index(0) edge to _0 with projections [.0]
/// _2 = _1.0.1                // should resolve to _0.0.1
/// return _2
/// ```
///
/// The key insight: resolving `_1.0` gives us `_0.0`, then we must resolve `_0.0.1`,
/// not just look for `.1` edges from `_0`.
#[test]
fn nested_projection_through_edge() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let inner_tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty]);
    let outer_tuple_ty = TypeBuilder::synthetic(&env).tuple([inner_tuple_ty, int_ty]);

    let input = builder.local("input", outer_tuple_ty);
    let other = builder.local("other", int_ty);
    let wrapped = builder.local(
        "wrapped",
        TypeBuilder::synthetic(&env).tuple([inner_tuple_ty, int_ty]),
    );
    let result = builder.local("result", int_ty);
    let result_place = builder.place_local(result);

    let input_field_0 = builder.place(|place| place.local(input).field(0, inner_tuple_ty));
    let other_place = builder.place_local(other);
    let wrapped_0_1 = builder.place(|place| {
        place
            .local(wrapped)
            .field(0, inner_tuple_ty)
            .field(1, int_ty)
    });

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(input, |rv| {
            rv.input(InputOp::Load { required: true }, "input")
        })
        .assign_local(other, |rv| {
            rv.input(InputOp::Load { required: true }, "other")
        })
        .assign_local(wrapped, |rv| rv.tuple([input_field_0, other_place]))
        .assign_place(result_place, |rv| rv.load(wrapped_0_1))
        .ret(result_place);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "nested_projection_through_edge",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that Param edges where all predecessors agree resolve correctly.
///
/// ```text
/// bb0:
///   _0 = input
///   _1 = (_0, _0)  // tuple where both elements are the same source
///   switch cond -> bb1(_1.0) | bb2(_1.1)
///
/// bb1(p):
///   goto bb3(p)
///
/// bb2(p):
///   goto bb3(p)
///
/// bb3(result):
///   return result  // Should resolve to _0 since both branches agree
/// ```
#[test]
fn param_consensus_agree() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty]);

    let input = builder.local("input", int_ty);
    let input = builder.place_local(input);
    let tup = builder.local("tup", tuple_ty);
    let tup_0 = builder.place(|place| place.local(tup).field(0, int_ty));
    let tup_1 = builder.place(|place| place.local(tup).field(1, int_ty));
    let cond = builder.local("cond", int_ty);
    let cond = builder.place_local(cond);
    let p1 = builder.local("p1", int_ty);
    let p2 = builder.local("p2", int_ty);
    let result = builder.local("result", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([p1]);
    let bb2 = builder.reserve_block([p2]);
    let bb3 = builder.reserve_block([result]);

    let p1 = builder.place_local(p1);
    let p2 = builder.place_local(p2);
    let result = builder.place_local(result);

    builder
        .build_block(bb0)
        .assign_place(input, |rv| rv.input(InputOp::Load { required: true }, "x"))
        .assign_local(tup, |rv| rv.tuple([input, input]))
        .assign_place(cond, |rv| {
            rv.input(InputOp::Load { required: true }, "cond")
        })
        .if_else(cond, bb1, [tup_0.into()], bb2, [tup_1.into()]);

    builder.build_block(bb1).goto(bb3, [p1.into()]);
    builder.build_block(bb2).goto(bb3, [p2.into()]);
    builder.build_block(bb3).ret(result);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "param_consensus_agree",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that Param edges where predecessors diverge do not resolve through.
///
/// ```text
/// bb0:
///   _0 = input_a
///   _1 = input_b
///   switch cond -> bb1 | bb2
///
/// bb1:
///   goto bb3(_0)
///
/// bb2:
///   goto bb3(_1)
///
/// bb3(result):
///   return result  // Cannot resolve - predecessors disagree
/// ```
#[test]
fn param_consensus_diverge() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let input_a = builder.local("input_a", int_ty);
    let input_a = builder.place_local(input_a);
    let input_b = builder.local("input_b", int_ty);
    let input_b = builder.place_local(input_b);
    let cond = builder.local("cond", int_ty);
    let cond = builder.place_local(cond);
    let result = builder.local("result", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([result]);

    let result = builder.place_local(result);

    builder
        .build_block(bb0)
        .assign_place(input_a, |rv| {
            rv.input(InputOp::Load { required: true }, "a")
        })
        .assign_place(input_b, |rv| {
            rv.input(InputOp::Load { required: true }, "b")
        })
        .assign_place(cond, |rv| {
            rv.input(InputOp::Load { required: true }, "cond")
        })
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, [input_a.into()]);
    builder.build_block(bb2).goto(bb3, [input_b.into()]);
    builder.build_block(bb3).ret(result);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "param_consensus_diverge",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests cycle detection through Param edges.
///
/// ```text
/// bb0:
///   _0 = input
///   goto bb1(_0)
///
/// bb1(x):
///   switch cond -> bb1(x) | bb2(x)  // Self-loop with param
///
/// bb2(result):
///   return result  // Should resolve despite cycle in bb1
/// ```
#[test]
fn param_cycle_detection() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let input = builder.local("input", int_ty);
    let input = builder.place_local(input);
    let x = builder.local("x", int_ty);
    let cond = builder.local("cond", int_ty);
    let cond = builder.place_local(cond);
    let result = builder.local("result", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([x]);
    let bb2 = builder.reserve_block([result]);

    let x = builder.place_local(x);
    let result = builder.place_local(result);

    builder
        .build_block(bb0)
        .assign_place(input, |rv| rv.input(InputOp::Load { required: true }, "x"))
        .assign_place(cond, |rv| {
            rv.input(InputOp::Load { required: true }, "cond")
        })
        .goto(bb1, [input.into()]);

    builder
        .build_block(bb1)
        .if_else(cond, bb1, [x.into()], bb2, [x.into()]);

    builder.build_block(bb2).ret(result);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "param_cycle_detection",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests constant propagation through edges.
///
/// ```text
/// _0 = (42, 100)      // Tuple with constants
/// _1 = _0.0           // Should resolve to constant 42
/// return _1
/// ```
#[test]
fn constant_propagation() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty]);

    let tup = builder.local("tup", tuple_ty);
    let tup_0 = builder.place(|place| place.local(tup).field(0, int_ty));
    let result = builder.local("result", int_ty);
    let result = builder.place_local(result);

    let const_42 = builder.const_int(42);
    let const_100 = builder.const_int(100);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(tup, |rv| rv.tuple([const_42, const_100]))
        .assign_place(result, |rv| rv.load(tup_0))
        .ret(result);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "constant_propagation",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests Load edge followed by Param edge resolution through branching.
///
/// ```text
/// bb0:
///   _0 = input
///   _1 = _0           // Load
///   switch cond -> bb1 | bb2
///
/// bb1:
///   goto bb3(_1)
///
/// bb2:
///   goto bb3(_1)
///
/// bb3(result):
///   return result     // Should resolve to _0 through Load then Param consensus
/// ```
#[test]
fn load_then_param_consensus() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();

    let input = builder.local("input", int_ty);
    let input = builder.place_local(input);

    let alias = builder.local("alias", int_ty);
    let alias = builder.place_local(alias);

    let cond = builder.local("cond", int_ty);
    let cond = builder.place_local(cond);

    let result = builder.local("result", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([result]);

    let result = builder.place_local(result);

    builder
        .build_block(bb0)
        .assign_place(input, |rv| rv.input(InputOp::Load { required: true }, "x"))
        .assign_place(alias, |rv| rv.load(input))
        .assign_place(cond, |rv| {
            rv.input(InputOp::Load { required: true }, "cond")
        })
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, [alias.into()]);
    builder.build_block(bb2).goto(bb3, [alias.into()]);
    builder.build_block(bb3).ret(result);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "load_then_param_consensus",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests deeply nested projections after following Load edges.
///
/// ```text
/// _0 = input          // ((int, int), (int, int))
/// _1 = _0             // Load: alias to the whole thing
/// _2 = _1.0           // Load with projection: alias.0 -> input.0
/// _3 = _2.1           // Load with projection: should resolve to input.0.1
/// return _3
/// ```
#[test]
fn load_chain_with_projections() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let inner_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty]);
    let outer_ty = TypeBuilder::synthetic(&env).tuple([inner_ty, inner_ty]);

    let input = builder.local("input", outer_ty);
    let input = builder.place_local(input);
    let alias = builder.local("alias", outer_ty);
    let alias_0 = builder.place(|place| place.local(alias).field(0, inner_ty));
    let inner = builder.local("inner", inner_ty);
    let inner_1 = builder.place(|place| place.local(inner).field(1, int_ty));
    let result = builder.local("result", int_ty);
    let result = builder.place_local(result);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(input, |rv| {
            rv.input(InputOp::Load { required: true }, "input")
        })
        .assign_local(alias, |rv| rv.load(input))
        .assign_local(inner, |rv| rv.load(alias_0))
        .assign_place(result, |rv| rv.load(inner_1))
        .ret(result);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "load_chain_with_projections",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests that wrapping a param in a tuple and then projecting back out resolves correctly.
///
/// ```text
/// bb0(x):
///   wrapped = (x,)
///   goto bb0(wrapped.0)
/// ```
#[test]
fn param_wrap_and_project() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty]);

    let x = builder.local("x", int_ty);
    let wrapped = builder.local("wrapped", tuple_ty);

    let bb0 = builder.reserve_block([x]);

    let x = builder.place_local(x);
    let wrapped_0 = builder.place(|p| p.local(wrapped).field(0, int_ty));

    builder
        .build_block(bb0)
        .assign_local(wrapped, |rv| rv.tuple([x]))
        .goto(bb0, [wrapped_0.into()]);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "param_wrap_and_project",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests resolving through a tuple projection to a constant param where predecessors agree.
///
/// ```text
/// bb0:
///   switch cond -> bb1 | bb2
///
/// bb1:
///   goto bb3(0)
///
/// bb2:
///   goto bb3(0)
///
/// bb3(x):
///   wrapped = (x,)
///   y = wrapped.0   // Should resolve through wrapped.0 -> x -> 0
///   return y
/// ```
#[test]
fn param_const_through_projection_agree() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty]);

    let cond = builder.local("cond", int_ty);
    let cond = builder.place_local(cond);
    let x = builder.local("x", int_ty);
    let wrapped = builder.local("wrapped", tuple_ty);
    let y = builder.local("y", int_ty);
    let y = builder.place_local(y);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([x]);

    let x = builder.place_local(x);
    let wrapped_0 = builder.place(|p| p.local(wrapped).field(0, int_ty));

    let const_0 = builder.const_int(0);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| {
            rv.input(InputOp::Load { required: true }, "cond")
        })
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, [const_0]);
    builder.build_block(bb2).goto(bb3, [const_0]);

    builder
        .build_block(bb3)
        .assign_local(wrapped, |rv| rv.tuple([x]))
        .assign_place(y, |rv| rv.load(wrapped_0))
        .ret(y);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "param_const_through_projection_agree",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests resolving through a tuple projection to a constant param where predecessors diverge.
///
/// ```text
/// bb0:
///   switch cond -> bb1 | bb2
///
/// bb1:
///   goto bb3(0)
///
/// bb2:
///   goto bb3(1)
///
/// bb3(x):
///   wrapped = (x,)
///   y = wrapped.0   // Should resolve to x (not constant, since predecessors diverge)
///   return y
/// ```
#[test]
fn param_const_through_projection_diverge() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let tuple_ty = TypeBuilder::synthetic(&env).tuple([int_ty]);

    let cond = builder.local("cond", int_ty);
    let cond = builder.place_local(cond);
    let x = builder.local("x", int_ty);
    let wrapped = builder.local("wrapped", tuple_ty);
    let y = builder.local("y", int_ty);
    let y = builder.place_local(y);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([x]);

    let x = builder.place_local(x);
    let wrapped_0 = builder.place(|p| p.local(wrapped).field(0, int_ty));

    let const_0 = builder.const_int(0);
    let const_1 = builder.const_int(1);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| {
            rv.input(InputOp::Load { required: true }, "cond")
        })
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, [const_0]);
    builder.build_block(bb2).goto(bb3, [const_1]);

    builder
        .build_block(bb3)
        .assign_local(wrapped, |rv| rv.tuple([x]))
        .assign_place(y, |rv| rv.load(wrapped_0))
        .ret(y);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "param_const_through_projection_diverge",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}

/// Tests projection prepending when the source is opaque (no edges to traverse).
///
/// When resolving through an Index edge whose target has projections, and there are
/// additional projections to apply, but the target is opaque (no outgoing edges),
/// we must correctly prepend the edge's projections to the remaining projections.
///
/// ```text
/// _0 = input          // opaque: (((int, int), int), int)
/// _1 = (_0.0.0, _0.1) // tuple: element 0 is _0.0.0 (deeply nested projection)
/// _2 = _1.0.1         // accessing element 0, then .1
///                     // should resolve: _1.0 -> _0.0.0, then _0.0.0.1
///                     // since _0 is opaque, result is Incomplete with projections .0.0.1
/// return _2
/// ```
#[test]
fn projection_prepending_opaque_source() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let pair_ty = TypeBuilder::synthetic(&env).tuple([int_ty, int_ty]);
    let triple_ty = TypeBuilder::synthetic(&env).tuple([pair_ty, int_ty]);
    let outer_ty = TypeBuilder::synthetic(&env).tuple([triple_ty, int_ty]);
    let wrapped_ty = TypeBuilder::synthetic(&env).tuple([pair_ty, int_ty]);

    let input = builder.local("input", outer_ty);
    let input_0_0 = builder.place(|p| p.local(input).field(0, triple_ty).field(0, pair_ty));
    let input_1 = builder.place(|p| p.local(input).field(1, int_ty));
    let wrapped = builder.local("wrapped", wrapped_ty);
    let wrapped_0_1 = builder.place(|p| p.local(wrapped).field(0, pair_ty).field(1, int_ty));
    let result = builder.local("result", int_ty);
    let result = builder.place_local(result);

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_local(input, |rv| {
            rv.input(InputOp::Load { required: true }, "input")
        })
        .assign_local(wrapped, |rv| rv.tuple([input_0_0, input_1]))
        .assign_place(result, |rv| rv.load(wrapped_0_1))
        .ret(result);

    let body = builder.finish(0, int_ty);

    assert_data_dependency(
        "projection_prepending_opaque_source",
        &body,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
    );
}
