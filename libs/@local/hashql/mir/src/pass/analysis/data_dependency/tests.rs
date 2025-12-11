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
