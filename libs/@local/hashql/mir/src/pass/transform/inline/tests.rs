#![expect(
    clippy::min_ident_chars,
    clippy::similar_names,
    clippy::non_ascii_literal,
    reason = "tests"
)]

use alloc::vec;
use core::{f32, fmt::Write as _};
use std::path::PathBuf;

use bstr::ByteVec as _;
use hashql_core::{
    heap::Heap,
    pretty::Formatter,
    symbol::sym,
    r#type::{TypeBuilder, TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::node::HirId;
use insta::{Settings, assert_snapshot};

use super::{
    BodyAnalysis, Inline, InlineConfig, InlineCostEstimationConfig, InlineHeuristicsConfig,
};
use crate::{
    body::{Body, Source, basic_block::BasicBlockId, location::Location},
    builder::{BodyBuilder, op, scaffold},
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        analysis::{CallGraph, CallSite},
        transform::inline::{
            BodyProperties, analysis::InlineDirective, heuristics::InlineHeuristics,
        },
    },
    pretty::TextFormat,
};

// =============================================================================
// Test Harness
// =============================================================================

/// Formats multiple bodies for snapshot testing.
fn format_bodies<'heap>(
    bodies: &DefIdSlice<Body<'heap>>,
    context: &MirContext<'_, 'heap>,
) -> String {
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
        .format(bodies, &[])
        .expect("should be able to write bodies");

    text_format.writer.into_string_lossy()
}

/// Test harness for inline pass that handles multiple bodies.
#[track_caller]
fn assert_inline_pass<'heap>(
    name: &'static str,
    bodies: &mut [Body<'heap>],
    context: &mut MirContext<'_, 'heap>,
    config: InlineConfig,
) {
    let bodies_slice = DefIdSlice::from_raw(bodies);
    let before = format_bodies(bodies_slice, context);

    let mut heap = Heap::new();
    let mut pass = Inline::new_in(config, &mut heap);
    pass.run(context, DefIdSlice::from_raw_mut(bodies));

    let bodies_slice = DefIdSlice::from_raw(bodies);
    let after = format_bodies(bodies_slice, context);

    let mut output = before;
    write!(output, "\n\n{:=^50}\n\n", " After Inlining ").expect("infallible");
    output.push_str(&after);

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/inline"));
    settings.set_prepend_module_to_snapshot(false);

    let _drop = settings.bind_to_scope();
    assert_snapshot!(name, output);
}

// =============================================================================
// Transformation Tests (insta snapshots)
// =============================================================================

/// Tests basic inlining of a simple leaf function.
///
/// Verifies:
/// - Locals are offset correctly
/// - Basic blocks are offset correctly
/// - Return is transformed to goto(continuation)
#[test]
fn inline_simple_leaf() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    // Build callee: fn callee(x: Int) -> Boolean { x == x }
    let x = builder.local("x", int_ty);
    let result = builder.local("result", bool_ty);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(result, |rv| rv.binary(x, op![==], x))
        .ret(result);

    let mut callee = builder.finish(1, bool_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Closure(HirId::PLACEHOLDER, None);

    // Build caller: fn caller() -> Boolean { callee(21) }
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", bool_ty);
    let const_21 = builder.const_int(21);
    let callee_fn = builder.const_fn(callee.id);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(callee_fn, [const_21]))
        .ret(out);

    let mut caller = builder.finish(0, bool_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let mut bodies = [callee, caller];

    assert_inline_pass(
        "inline_simple_leaf",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        InlineConfig::default(),
    );
}

/// Tests inlining a callee with multiple arguments.
///
/// Verifies argument assignment statements are correctly added before the goto.
#[test]
fn inline_multiple_args() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    // Build callee: fn compare3(a: Int, b: Int, c: Int) -> Boolean { (a == b) & (b == c) }
    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let c = builder.local("c", int_ty);
    let tmp1 = builder.local("tmp1", bool_ty);
    let tmp2 = builder.local("tmp2", bool_ty);
    let result = builder.local("result", bool_ty);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(tmp1, |rv| rv.binary(a, op![==], b))
        .assign_place(tmp2, |rv| rv.binary(b, op![==], c))
        .assign_place(result, |rv| rv.binary(tmp1, op![&], tmp2))
        .ret(result);

    let mut callee = builder.finish(3, bool_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Closure(HirId::PLACEHOLDER, None);

    // Build caller
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", bool_ty);
    let const_1 = builder.const_int(1);
    let const_2 = builder.const_int(2);
    let const_3 = builder.const_int(3);
    let callee_fn = builder.const_fn(callee.id);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(callee_fn, [const_1, const_2, const_3]))
        .ret(out);

    let mut caller = builder.finish(0, bool_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let mut bodies = [callee, caller];

    assert_inline_pass(
        "inline_multiple_args",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        InlineConfig::default(),
    );
}

/// Tests inlining a callee with multiple basic blocks (if/else).
///
/// Verifies all callee blocks are copied and renumbered correctly.
#[test]
fn inline_multiple_blocks() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    // Build callee: fn max(a: Int, b: Int) -> Int { if a > b then a else b }
    let a = builder.local("a", int_ty);
    let b = builder.local("b", int_ty);
    let cond = builder.local("cond", bool_ty);
    let result = builder.local("result", int_ty);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([]);
    let bb2 = builder.reserve_block([]);
    let bb3 = builder.reserve_block([result.local]);

    builder
        .build_block(bb0)
        .assign_place(cond, |rv| rv.binary(a, op![>], b))
        .if_else(cond, bb1, [], bb2, []);

    builder.build_block(bb1).goto(bb3, [a.into()]);
    builder.build_block(bb2).goto(bb3, [b.into()]);
    builder.build_block(bb3).ret(result);

    let mut callee = builder.finish(2, int_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Closure(HirId::PLACEHOLDER, None);

    // Build caller
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", int_ty);
    let const_10 = builder.const_int(10);
    let const_20 = builder.const_int(20);
    let callee_fn = builder.const_fn(callee.id);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(callee_fn, [const_10, const_20]))
        .ret(out);

    let mut caller = builder.finish(0, int_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let mut bodies = [callee, caller];

    assert_inline_pass(
        "inline_multiple_blocks",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        InlineConfig::default(),
    );
}

/// Tests that statements after the call are preserved in continuation block.
#[test]
fn inline_continuation_terminator() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();

    // Simple callee: fn identity(x: Int) -> Int { x }
    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut callee = builder.finish(1, int_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Closure(HirId::PLACEHOLDER, None);

    // Caller with statements after the call
    let mut builder = BodyBuilder::new(&interner);
    let tmp = builder.local("tmp", int_ty);
    let out = builder.local("out", bool_ty);
    let const_5 = builder.const_int(5);
    let const_10 = builder.const_int(10);
    let callee_fn = builder.const_fn(callee.id);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(tmp, |rv| rv.apply(callee_fn, [const_5]))
        .assign_place(out, |rv| rv.binary(tmp, op![==], const_10))
        .ret(out);

    let mut caller = builder.finish(0, bool_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let mut bodies = [callee, caller];

    assert_inline_pass(
        "inline_continuation_terminator",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        InlineConfig::default(),
    );
}

// =============================================================================
// BodyAnalysis Tests (assertions)
// =============================================================================

/// Tests that `Source::Ctor` produces `InlineDirective::Always`.
#[test]
fn analysis_ctor_directive() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut body = builder.finish(1, int_ty);
    body.id = DefId::new(0);
    body.source = Source::Ctor(sym::lexical::Some);

    let bodies = [body];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let mut analysis = BodyAnalysis::new(
        &graph,
        bodies_slice,
        InlineCostEstimationConfig::default(),
        &heap,
    );

    analysis.run(&bodies[0]);
    let result = analysis.finish();

    assert_eq!(
        result.properties[DefId::new(0)].directive,
        InlineDirective::Always
    );
}

/// Tests that `Source::Intrinsic` produces `InlineDirective::Never`.
#[test]
fn analysis_intrinsic_directive() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut body = builder.finish(1, int_ty);
    body.id = DefId::new(0);
    body.source = Source::Intrinsic(DefId::new(0));

    let bodies = [body];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let mut analysis = BodyAnalysis::new(
        &graph,
        bodies_slice,
        InlineCostEstimationConfig::default(),
        &heap,
    );

    analysis.run(&bodies[0]);
    let result = analysis.finish();

    assert_eq!(
        result.properties[DefId::new(0)].directive,
        InlineDirective::Never
    );
}

/// Tests that `Source::Closure` produces `InlineDirective::Heuristic`.
#[test]
fn analysis_closure_directive() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut body = builder.finish(1, int_ty);
    body.id = DefId::new(0);
    body.source = Source::Closure(HirId::PLACEHOLDER, None);

    let bodies = [body];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let mut analysis = BodyAnalysis::new(
        &graph,
        bodies_slice,
        InlineCostEstimationConfig::default(),
        &heap,
    );

    analysis.run(&bodies[0]);
    let result = analysis.finish();

    assert_eq!(
        result.properties[DefId::new(0)].directive,
        InlineDirective::Heuristic
    );
}

/// Tests that cost estimation calculates correctly from rvalues and terminators.
#[test]
fn analysis_cost_estimation() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Body with: 1 binary, 1 basic_block, 1 return
    let bool_ty = TypeBuilder::synthetic(&env).boolean();
    let x = builder.local("x", int_ty);
    let y = builder.local("y", bool_ty);
    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(y, |rv| rv.binary(x, op![==], x))
        .ret(y);

    let mut body = builder.finish(1, int_ty);
    body.id = DefId::new(0);
    body.source = Source::Closure(HirId::PLACEHOLDER, None);

    let bodies = [body];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let config = InlineCostEstimationConfig::default();

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let mut analysis = BodyAnalysis::new(&graph, bodies_slice, config, &heap);

    analysis.run(&bodies[0]);
    let result = analysis.finish();

    // Expected: rvalue_binary + basic_block + terminator_return
    let expected = config.rvalue_binary + config.basic_block + config.terminator_return;
    assert!(
        (result.properties[DefId::new(0)].cost - expected).abs() < f32::EPSILON,
        "expected cost {expected}, got {}",
        result.properties[DefId::new(0)].cost
    );
}

/// Tests that leaf detection works (no outgoing calls except intrinsics).
#[test]
fn analysis_is_leaf() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Leaf function (no calls)
    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut leaf = builder.finish(1, int_ty);
    leaf.id = DefId::new(0);
    leaf.source = Source::Closure(HirId::PLACEHOLDER, None);

    // Non-leaf function (calls leaf)
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", int_ty);
    let const_5 = builder.const_int(5);
    let leaf_fn = builder.const_fn(leaf.id);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(leaf_fn, [const_5]))
        .ret(out);

    let mut non_leaf = builder.finish(0, int_ty);
    non_leaf.id = DefId::new(1);
    non_leaf.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let bodies = [leaf, non_leaf];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let mut analysis = BodyAnalysis::new(
        &graph,
        bodies_slice,
        InlineCostEstimationConfig::default(),
        &heap,
    );

    for body in &bodies {
        analysis.run(body);
    }
    let result = analysis.finish();

    assert!(
        result.properties[DefId::new(0)].is_leaf,
        "leaf should be marked as leaf"
    );
    assert!(
        !result.properties[DefId::new(1)].is_leaf,
        "non_leaf should not be marked as leaf"
    );
}

// =============================================================================
// InlineHeuristics Tests (assertions)
// =============================================================================

/// Tests that `InlineDirective::Always` produces +∞ score.
#[test]
fn heuristics_always_directive() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Create minimal callee
    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut callee = builder.finish(1, int_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Ctor(sym::lexical::Some);

    // Create caller
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", int_ty);
    let callee_fn = builder.const_fn(callee.id);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(callee_fn, [const_1]))
        .ret(out);

    let mut caller = builder.finish(0, int_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let bodies = [callee, caller];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);

    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            directive: InlineDirective::Always,
            cost: 100.0,
            is_leaf: true,
        },
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let properties_slice = properties.as_slice();

    let loops = DefIdVec::new_in(&heap);

    let heuristics = InlineHeuristics {
        config: InlineHeuristicsConfig::default(),
        graph: &graph,
        loops: &loops,
        properties: properties_slice,
    };

    let callsite = CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 1,
        },
        target: DefId::new(0),
    };

    let score = heuristics.score(callsite);
    assert!(
        score.is_infinite() && score.is_sign_positive(),
        "Always directive should give +∞"
    );
}

/// Tests that `InlineDirective::Never` produces -∞ score.
#[test]
fn heuristics_never_directive() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Create callee
    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut callee = builder.finish(1, int_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Intrinsic(DefId::new(0));

    // Create caller
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", int_ty);
    let callee_fn = builder.const_fn(callee.id);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(callee_fn, [const_1]))
        .ret(out);

    let mut caller = builder.finish(0, int_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let bodies = [callee, caller];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);

    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            directive: InlineDirective::Never,
            cost: 5.0,
            is_leaf: true,
        },
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let properties_slice = properties.as_slice();

    let loops = DefIdVec::new_in(&heap);

    let heuristics = InlineHeuristics {
        config: InlineHeuristicsConfig::default(),
        graph: &graph,
        loops: &loops,
        properties: properties_slice,
    };

    let callsite = CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 1,
        },
        target: DefId::new(0),
    };

    let score = heuristics.score(callsite);
    assert!(
        score.is_infinite() && score.is_sign_negative(),
        "Never directive should give -∞"
    );
}

/// Tests that cost below `always_inline` threshold gives +∞.
#[test]
fn heuristics_small_cost() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Create callee
    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut callee = builder.finish(1, int_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Closure(HirId::PLACEHOLDER, None);

    // Create caller
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", int_ty);
    let callee_fn = builder.const_fn(callee.id);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(callee_fn, [const_1]))
        .ret(out);

    let mut caller = builder.finish(0, int_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let bodies = [callee, caller];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);

    let config = InlineHeuristicsConfig::default();

    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost: config.always_inline - 1.0, // Below threshold
            is_leaf: true,
        },
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let properties_slice = properties.as_slice();

    let loops = DefIdVec::new_in(&heap);

    let heuristics = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties_slice,
    };

    let callsite = CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 1,
        },
        target: DefId::new(0),
    };

    let score = heuristics.score(callsite);
    assert!(
        score.is_infinite() && score.is_sign_positive(),
        "Small cost should give +∞"
    );
}

/// Tests that cost above `max` threshold gives -∞.
#[test]
fn heuristics_large_cost() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Create callee
    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut callee = builder.finish(1, int_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Closure(HirId::PLACEHOLDER, None);

    // Create caller
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", int_ty);
    let callee_fn = builder.const_fn(callee.id);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(callee_fn, [const_1]))
        .ret(out);

    let mut caller = builder.finish(0, int_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let bodies = [callee, caller];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);

    let config = InlineHeuristicsConfig::default();

    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost: config.max + 1.0, // Above threshold
            is_leaf: true,
        },
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let properties_slice = properties.as_slice();

    let loops = DefIdVec::new_in(&heap);

    let heuristics = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties_slice,
    };

    let callsite = CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 1,
        },
        target: DefId::new(0),
    };

    let score = heuristics.score(callsite);
    assert!(
        score.is_infinite() && score.is_sign_negative(),
        "Large cost should give -∞"
    );
}

/// Tests that leaf callee gets leaf bonus in score.
#[test]
fn heuristics_leaf_bonus() {
    scaffold!(heap, interner, builder);
    let env = Environment::new(&heap);
    let int_ty = TypeBuilder::synthetic(&env).integer();

    // Create callee
    let x = builder.local("x", int_ty);
    let bb0 = builder.reserve_block([]);
    builder.build_block(bb0).ret(x);

    let mut callee = builder.finish(1, int_ty);
    callee.id = DefId::new(0);
    callee.source = Source::Closure(HirId::PLACEHOLDER, None);

    // Create caller
    let mut builder = BodyBuilder::new(&interner);
    let out = builder.local("out", int_ty);
    let callee_fn = builder.const_fn(callee.id);
    let const_1 = builder.const_int(1);

    let bb0 = builder.reserve_block([]);
    builder
        .build_block(bb0)
        .assign_place(out, |rv| rv.apply(callee_fn, [const_1]))
        .ret(out);

    let mut caller = builder.finish(0, int_ty);
    caller.id = DefId::new(1);
    caller.source = Source::Thunk(HirId::PLACEHOLDER, None);

    let bodies = [callee, caller];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);

    let config = InlineHeuristicsConfig::default();
    let cost = 50.0; // Between always_inline and max

    // Test with is_leaf = true
    let properties_leaf = DefIdVec::from_raw(vec![
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost,
            is_leaf: true,
        },
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);

    // Test with is_leaf = false
    let properties_non_leaf = DefIdVec::from_raw(vec![
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost,
            is_leaf: false,
        },
        BodyProperties {
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);

    let loops = DefIdVec::new_in(&heap);

    let heuristics_leaf = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties_leaf.as_slice(),
    };

    let heuristics_non_leaf = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties_non_leaf.as_slice(),
    };

    let callsite = CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 1,
        },
        target: DefId::new(0),
    };

    let score_leaf = heuristics_leaf.score(callsite);
    let score_non_leaf = heuristics_non_leaf.score(callsite);

    assert!(
        (score_leaf - score_non_leaf - config.leaf_bonus).abs() < f32::EPSILON,
        "Leaf should add leaf_bonus: leaf={score_leaf}, non_leaf={score_non_leaf}, bonus={}",
        config.leaf_bonus
    );
}
