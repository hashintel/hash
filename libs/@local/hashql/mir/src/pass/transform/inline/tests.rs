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
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{
    BodyAnalysis, Inline, InlineConfig, InlineCostEstimationConfig, InlineHeuristicsConfig,
};
use crate::{
    body::{Body, basic_block::BasicBlockId, location::Location},
    builder::body,
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee = body!(interner, env; fn@0/1 -> Bool {
        decl x: Int, result: Bool;

        bb0() {
            result = bin.== x x;
            return result;
        }
    });

    let caller = body!(interner, env; thunk@1/0 -> Bool {
        decl out: Bool;

        bb0() {
            out = apply (callee.id), 21;
            return out;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let compare3 = body!(interner, env; fn@0/3 -> Bool {
        decl a: Int, b: Int, c: Int, tmp1: Bool, tmp2: Bool, result: Bool;

        bb0() {
            tmp1 = bin.== a b;
            tmp2 = bin.== b c;
            result = bin.& tmp1 tmp2;
            return result;
        }
    });

    let caller = body!(interner, env; thunk@1/0 -> Bool {
        decl out: Bool;

        bb0() {
            out = apply (compare3.id), 1, 2, 3;
            return out;
        }
    });

    let mut bodies = [compare3, caller];

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Build callee: fn max(a: Int, b: Int) -> Int { if a > b then a else b }
    let callee = body!(interner, env; fn@0/2 -> Int {
        decl a: Int, b: Int, cond: Bool, result: Int;

        bb0() {
            cond = bin.> a b;
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(a);
        },
        bb2() {
            goto bb3(b);
        },
        bb3(result) {
            return result;
        }
    });

    let caller = body!(interner, env; thunk@1/0 -> Int {
        decl out: Int;

        bb0() {
            out = apply (callee.id), 10, 20;
            return out;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Simple callee: fn identity(x: Int) -> Int { x }
    let callee = body!(interner, env; fn@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    // Caller with statements after the call
    let caller = body!(interner, env; thunk@1/0 -> Bool {
        decl tmp: Int, out: Bool;

        bb0() {
            tmp = apply (callee.id), 5;
            out = bin.== tmp 10;
            return out;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [ctor sym::lexical::Some]@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; intrinsic@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Body with: 1 binary, 1 basic_block, 1 return
    let body = body!(interner, env; fn@0/1 -> Int {
        decl x: Int, y: Bool;

        bb0() {
            y = bin.== x x;
            return y;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Leaf function (no calls)
    let leaf = body!(interner, env; fn@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    // Non-leaf function (calls leaf)
    let non_leaf = body!(interner, env; thunk@1/0 -> Int {
        decl out: Int;

        bb0() {
            out = apply (leaf.id), 5;
            return out;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Create minimal callee
    let callee = body!(interner, env; [ctor sym::lexical::Some]@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    // Create caller
    let caller = body!(interner, env; thunk@1/0 -> Int {
        decl out: Int;

        bb0() {
            out = apply (callee.id), 1;
            return out;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Create callee
    let callee = body!(interner, env; intrinsic@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    // Create caller
    let caller = body!(interner, env; thunk@1/0 -> Int {
        decl out: Int;

        bb0() {
            out = apply (callee.id), 1;
            return out;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Create callee
    let callee = body!(interner, env; fn@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    // Create caller
    let caller = body!(interner, env; thunk@1/0 -> Int {
        decl out: Int;

        bb0() {
            out = apply (callee.id), 1;
            return out;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Create callee
    let callee = body!(interner, env; fn@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    // Create caller
    let caller = body!(interner, env; thunk@1/0 -> Int {
        decl out: Int;

        bb0() {
            out = apply (callee.id), 1;
            return out;
        }
    });

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
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Create callee
    let callee = body!(interner, env; fn@0/1 -> Int {
        decl x: Int;

        bb0() {
            return x;
        }
    });

    // Create caller
    let caller = body!(interner, env; thunk@1/0 -> Int {
        decl out: Int;

        bb0() {
            out = apply (callee.id), 1;
            return out;
        }
    });

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
