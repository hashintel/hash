#![expect(clippy::min_ident_chars, clippy::similar_names, reason = "tests")]

use alloc::{alloc::Global, collections::BinaryHeap, vec};
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
    body::{Body, Source, basic_block::BasicBlockId, location::Location},
    builder::body,
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
    pass::{
        Changed, GlobalTransformPass as _, OwnedGlobalTransformState,
        analysis::{CallGraph, CallSite},
        transform::inline::{
            BodyProperties, Candidate, analysis::InlineDirective, heuristics::InlineHeuristics,
        },
    },
    pretty::TextFormatOptions,
};

/// Creates an identity function: `fn(x: Int) -> Int { return x; }`.
fn identity_callee<'heap>(
    interner: &Interner<'heap>,
    env: &Environment<'heap>,
    id: DefId,
) -> Body<'heap> {
    body!(interner, env; fn@id/1 -> Int {
        decl x: Int;
        bb0() { return x; }
    })
}

/// Creates a simple caller thunk that calls the given callee with one argument.
fn simple_caller<'heap>(
    interner: &Interner<'heap>,
    env: &Environment<'heap>,
    id: DefId,
    callee_id: DefId,
) -> Body<'heap> {
    body!(interner, env; thunk@id/0 -> Int {
        decl out: Int;
        bb0() {
            out = apply (callee_id), 1;
            return out;
        }
    })
}

/// Creates a caller/callee pair for heuristics testing.
fn callee_caller_pair<'heap>(
    interner: &Interner<'heap>,
    env: &Environment<'heap>,
) -> (Body<'heap>, Body<'heap>) {
    let callee_id = DefId::new(0);
    let caller_id = DefId::new(1);
    (
        identity_callee(interner, env, callee_id),
        simple_caller(interner, env, caller_id, callee_id),
    )
}

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
    let mut text_format = TextFormatOptions {
        writer: Vec::new(),
        indent: 4,
        sources: (),
        types: &mut formatter,
    }
    .build();

    text_format
        .format(bodies, &[])
        .expect("should be able to write bodies");

    text_format.writer.into_string_lossy()
}

#[track_caller]
fn assert_inline_pass<'heap>(
    name: &'static str,
    bodies: &mut [Body<'heap>],
    context: &mut MirContext<'_, 'heap>,
    config: InlineConfig,
) {
    let bodies = DefIdSlice::from_raw_mut(bodies);
    let before = format_bodies(bodies, context);

    let mut heap = Heap::new();
    let mut pass = Inline::new_in(config, &mut heap);
    let _: Changed = pass.run(
        context,
        &mut OwnedGlobalTransformState::new_in(bodies, Global).as_mut(),
        bodies,
    );

    let after = format_bodies(bodies, context);

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

fn default_callsite() -> CallSite<Location> {
    CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 1,
        },
        target: DefId::new(0),
    }
}

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

#[test]
fn inline_multiple_blocks() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee = body!(interner, env; fn@0/2 -> Int {
        decl a: Int, b: Int, cond: Bool, result: Int;
        bb0() {
            cond = bin.> a b;
            if cond then bb1() else bb2();
        },
        bb1() { goto bb3(a); },
        bb2() { goto bb3(b); },
        bb3(result) { return result; }
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

#[test]
fn inline_continuation_terminator() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let callee = identity_callee(&interner, &env, callee_id);

    let caller = body!(interner, env; thunk@1/0 -> Bool {
        decl tmp: Int, out: Bool;
        bb0() {
            tmp = apply (callee_id), 5;
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

#[test]
fn inline_chained_calls() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let c_id = DefId::new(0);
    let b_id = DefId::new(1);
    let a_id = DefId::new(2);

    let c = identity_callee(&interner, &env, c_id);

    let b = body!(interner, env; fn@b_id/1 -> Int {
        decl y: Int, tmp: Int;
        bb0() {
            tmp = apply (c_id), y;
            return tmp;
        }
    });

    let a = simple_caller(&interner, &env, a_id, b_id);

    let mut bodies = [c, b, a];

    assert_inline_pass(
        "inline_chained_calls",
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

/// Tests that inlining correctly handles assignment to projections.
#[test]
fn inline_projection_assignment() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let callee = identity_callee(&interner, &env, callee_id);

    // Caller assigns apply result directly to a projection
    let caller = body!(interner, env; thunk@1/0 -> Int {
        decl tup: (Int, Int), out: Int;
        @proj tup_0 = tup.0: Int;
        bb0() {
            tup = tuple 0, 0;
            tup_0 = apply (callee_id), 5;
            out = load tup_0;
            return out;
        }
    });

    let mut bodies = [callee, caller];

    assert_inline_pass(
        "inline_projection_assignment",
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

#[test]
fn inline_recursive_not_inlined() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let recursive_id = DefId::new(0);
    let caller_id = DefId::new(1);

    let recursive = body!(interner, env; fn@recursive_id/1 -> Int {
        decl n: Int, cond: Bool, result: Int, sub_result: Int;
        bb0() {
            cond = bin.== n 0;
            if cond then bb1() else bb2();
        },
        bb1() { goto bb3(n); },
        bb2() {
            sub_result = apply (recursive_id), n;
            goto bb3(sub_result);
        },
        bb3(result) { return result; }
    });

    let caller = simple_caller(&interner, &env, caller_id, recursive_id);

    let mut bodies = [recursive, caller];

    assert_inline_pass(
        "inline_recursive_not_inlined",
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

#[test]
fn inline_budget_exhaustion() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee = body!(interner, env; fn@0/1 -> Bool {
        decl x: Int, a: Bool, b: Bool, c: Bool, d: Bool, e: Bool;
        bb0() {
            a = bin.== x 1;
            b = bin.> x 2;
            c = bin.< x 3;
            d = bin.== x 4;
            e = bin.> x 5;
            return e;
        }
    });

    let caller = body!(interner, env; thunk@1/0 -> Bool {
        decl o1: Bool, o2: Bool, o3: Bool, o4: Bool, o5: Bool, o6: Bool, result: Bool;
        bb0() {
            o1 = apply (callee.id), 1;
            o2 = apply (callee.id), 2;
            o3 = apply (callee.id), 3;
            o4 = apply (callee.id), 4;
            o5 = apply (callee.id), 5;
            o6 = apply (callee.id), 6;
            result = bin.== o1 o2;
            return result;
        }
    });

    let mut bodies = [callee, caller];

    let config = InlineConfig {
        heuristics: InlineHeuristicsConfig {
            always_inline: 5.0,
            max: 100.0,
            ..InlineHeuristicsConfig::default()
        },
        budget_multiplier: 0.5,
        ..InlineConfig::default()
    };

    assert_inline_pass(
        "inline_budget_exhaustion",
        &mut bodies,
        &mut MirContext {
            heap: &heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        },
        config,
    );
}

/// Tests that candidates are processed in max-heap order (highest score first).
///
/// This is a regression test for a bug where the ordering was accidentally reversed.
#[test]
#[expect(clippy::float_cmp)]
fn candidates_ordered_by_descending_score() {
    // Create callsites with different scores
    let callsite_low = CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 0,
        },
        target: DefId::new(0),
    };
    let callsite_mid = CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 1,
        },
        target: DefId::new(0),
    };
    let callsite_high = CallSite {
        caller: DefId::new(1),
        kind: Location {
            block: BasicBlockId::new(0),
            statement_index: 2,
        },
        target: DefId::new(0),
    };

    let mut candidates: BinaryHeap<Candidate> = BinaryHeap::new();
    candidates.push(Candidate {
        score: 10.0,
        callsite: callsite_low,
    });
    candidates.push(Candidate {
        score: 50.0,
        callsite: callsite_high,
    });
    candidates.push(Candidate {
        score: 30.0,
        callsite: callsite_mid,
    });

    let drained: Vec<_> = candidates.drain_sorted().collect();

    assert_eq!(drained.len(), 3);
    assert!(
        drained[0].score > drained[1].score && drained[1].score > drained[2].score,
        "Expected descending order: {:?}",
        drained.iter().map(|c| c.score).collect::<Vec<_>>()
    );
    assert_eq!(drained[0].score, 50.0, "Highest score should be first");
    assert_eq!(drained[1].score, 30.0, "Middle score should be second");
    assert_eq!(drained[2].score, 10.0, "Lowest score should be last");
}

#[test]
fn analysis_directives_by_source() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Create one body and clone it for different sources
    let mut closure_body = identity_callee(&interner, &env, DefId::new(0));

    let mut ctor_body = closure_body.clone();
    ctor_body.id = DefId::new(1);
    ctor_body.source = Source::Ctor(sym::lexical::Some);

    let mut intrinsic_body = closure_body.clone();
    intrinsic_body.id = DefId::new(2);
    intrinsic_body.source = Source::Intrinsic(DefId::PLACEHOLDER);

    // Fix closure_body id to be 0
    closure_body.id = DefId::new(0);

    let bodies = [closure_body, ctor_body, intrinsic_body];
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

    assert_eq!(
        result.properties[DefId::new(0)].directive,
        InlineDirective::Heuristic
    );
    assert_eq!(
        result.properties[DefId::new(1)].directive,
        InlineDirective::Always
    );
    assert_eq!(
        result.properties[DefId::new(2)].directive,
        InlineDirective::Never
    );
}

#[test]
fn analysis_cost_estimation() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

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

    let expected = config.rvalue_binary + config.basic_block + config.terminator_return;
    assert!(
        (result.properties[DefId::new(0)].cost - expected).abs() < f32::EPSILON,
        "expected cost {expected}, got {}",
        result.properties[DefId::new(0)].cost
    );
}

#[test]
fn analysis_is_leaf() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let bodies: [_; 2] = callee_caller_pair(&interner, &env).into();
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

    assert!(result.properties[DefId::new(0)].is_leaf);
    assert!(!result.properties[DefId::new(1)].is_leaf);
}

#[test]
fn analysis_loop_detection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; fn@0/1 -> Int {
        decl i: Int, cond: Bool;
        bb0() {
            cond = bin.== i 10;
            goto bb1();
        },
        bb1() { if cond then bb2() else bb0(); },
        bb2() { return i; }
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

    let loop_blocks = result
        .loops
        .lookup(DefId::new(0))
        .expect("should detect loop");
    assert!(loop_blocks.contains(BasicBlockId::new(0)));
    assert!(loop_blocks.contains(BasicBlockId::new(1)));
    assert!(!loop_blocks.contains(BasicBlockId::new(2)));
}

#[test]
fn heuristics_directive_scores() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let bodies: [_; 2] = callee_caller_pair(&interner, &env).into();
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let loops = DefIdVec::new_in(&heap);
    let config = InlineHeuristicsConfig::default();
    let callsite = default_callsite();

    // Test Always -> +∞
    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Always,
            cost: 100.0,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let heuristics = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties.as_slice(),
    };
    let score = heuristics.score(callsite);
    assert!(score.is_infinite() && score.is_sign_positive());

    // Test Never -> -∞
    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Never,
            cost: 5.0,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let heuristics = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties.as_slice(),
    };
    let score = heuristics.score(callsite);
    assert!(score.is_infinite() && score.is_sign_negative());
}

#[test]
fn heuristics_cost_thresholds() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let bodies: [_; 2] = callee_caller_pair(&interner, &env).into();
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let loops = DefIdVec::new_in(&heap);
    let config = InlineHeuristicsConfig::default();
    let callsite = default_callsite();

    // Below always_inline -> +∞
    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: config.always_inline - 1.0,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let heuristics = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties.as_slice(),
    };
    assert!(
        heuristics.score(callsite).is_infinite() && heuristics.score(callsite).is_sign_positive()
    );

    // Above max -> -∞
    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: config.max + 1.0,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let heuristics = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties.as_slice(),
    };
    assert!(
        heuristics.score(callsite).is_infinite() && heuristics.score(callsite).is_sign_negative()
    );
}

#[test]
fn heuristics_leaf_bonus() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let bodies: [_; 2] = callee_caller_pair(&interner, &env).into();
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let loops = DefIdVec::new_in(&heap);
    let config = InlineHeuristicsConfig::default();
    let cost = 50.0;
    let callsite = default_callsite();

    let props_leaf = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);
    let props_non_leaf = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost,
            is_leaf: false,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 10.0,
            is_leaf: false,
        },
    ]);

    let h_leaf = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: props_leaf.as_slice(),
    };
    let h_non_leaf = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: props_non_leaf.as_slice(),
    };

    let diff = h_leaf.score(callsite) - h_non_leaf.score(callsite);
    assert!((diff - config.leaf_bonus).abs() < f32::EPSILON);
}

#[test]
fn heuristics_loop_bonus() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let caller_id = DefId::new(1);

    let callee = identity_callee(&interner, &env, callee_id);
    // Caller with loop: bb0 loops back to itself
    let caller = body!(interner, env; thunk@caller_id/0 -> Int {
        decl out: Int, cond: Bool;
        bb0() {
            out = apply (callee_id), 1;
            cond = bin.== out 10;
            if cond then bb1() else bb0();
        },
        bb1() { return out; }
    });

    let bodies = [callee, caller];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let config = InlineHeuristicsConfig::default();
    let cost = 30.0;

    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 50.0,
            is_leaf: false,
        },
    ]);

    // Run analysis to detect loops
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

    let empty_loops = DefIdVec::new_in(&heap);
    let callsite = default_callsite();

    let h_with_loops = InlineHeuristics {
        config,
        graph: &graph,
        loops: &result.loops,
        properties: properties.as_slice(),
    };
    let h_no_loops = InlineHeuristics {
        config,
        graph: &graph,
        loops: &empty_loops,
        properties: properties.as_slice(),
    };

    let diff = h_with_loops.score(callsite) - h_no_loops.score(callsite);
    assert!((diff - config.loop_bonus).abs() < f32::EPSILON);
}

#[test]
fn heuristics_max_loop_multiplier() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let caller_id = DefId::new(1);

    let callee = identity_callee(&interner, &env, callee_id);
    let caller = body!(interner, env; thunk@caller_id/0 -> Int {
        decl out: Int, cond: Bool;
        bb0() {
            out = apply (callee_id), 1;
            cond = bin.== out 10;
            if cond then bb1() else bb0();
        },
        bb1() { return out; }
    });

    let bodies = [callee, caller];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let config = InlineHeuristicsConfig::default();
    let cost = config.max + 5.0; // Between max and max * multiplier

    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 50.0,
            is_leaf: false,
        },
    ]);

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

    let empty_loops = DefIdVec::new_in(&heap);
    let callsite = default_callsite();

    let h_with_loops = InlineHeuristics {
        config,
        graph: &graph,
        loops: &result.loops,
        properties: properties.as_slice(),
    };
    let h_no_loops = InlineHeuristics {
        config,
        graph: &graph,
        loops: &empty_loops,
        properties: properties.as_slice(),
    };

    // In loop: allowed (finite score)
    assert!(h_with_loops.score(callsite).is_finite());
    // Not in loop: rejected (-∞)
    assert!(
        h_no_loops.score(callsite).is_infinite() && h_no_loops.score(callsite).is_sign_negative()
    );
}

#[test]
fn heuristics_caller_bonuses() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let bodies: [_; 2] = callee_caller_pair(&interner, &env).into();
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let loops = DefIdVec::new_in(&heap);
    let config = InlineHeuristicsConfig::default();
    let cost = 30.0;

    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 50.0,
            is_leaf: false,
        },
    ]);

    let heuristics = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties.as_slice(),
    };

    let expected = config.leaf_bonus + config.single_caller_bonus + config.unique_callsite_bonus
        - cost * config.size_penalty_factor;

    assert!((heuristics.score(default_callsite()) - expected).abs() < f32::EPSILON);
}

#[test]
fn heuristics_no_unique_callsite_bonus_multiple_calls() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(0);
    let callee = identity_callee(&interner, &env, callee_id);

    // Two calls to same callee
    let caller = body!(interner, env; thunk@1/0 -> Bool {
        decl out1: Int, out2: Int, result: Bool;
        bb0() {
            out1 = apply (callee_id), 1;
            out2 = apply (callee_id), 2;
            result = bin.== out1 out2;
            return result;
        }
    });

    let bodies = [callee, caller];
    let bodies_slice = DefIdSlice::from_raw(&bodies);

    let graph = CallGraph::analyze_in(bodies_slice, &heap);
    let loops = DefIdVec::new_in(&heap);
    let config = InlineHeuristicsConfig::default();
    let cost = 30.0;

    let properties = DefIdVec::from_raw(vec![
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost,
            is_leaf: true,
        },
        BodyProperties {
            source: Source::Intrinsic(DefId::PLACEHOLDER),
            directive: InlineDirective::Heuristic,
            cost: 50.0,
            is_leaf: false,
        },
    ]);

    let heuristics = InlineHeuristics {
        config,
        graph: &graph,
        loops: &loops,
        properties: properties.as_slice(),
    };

    // No unique_callsite_bonus because 2 callsites
    let expected =
        config.leaf_bonus + config.single_caller_bonus - cost * config.size_penalty_factor;

    assert!((heuristics.score(default_callsite()) - expected).abs() < f32::EPSILON);
}
