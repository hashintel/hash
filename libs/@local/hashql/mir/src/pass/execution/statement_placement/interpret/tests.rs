//! Tests for [`InterpreterStatementPlacement`].
#![expect(clippy::min_ident_chars)]

use hashql_core::{heap::Heap, symbol::sym, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;

use crate::{
    builder::body,
    context::MirContext,
    def::DefId,
    intern::Interner,
    pass::execution::{
        statement_placement::{
            InterpreterStatementPlacement, StatementPlacement as _,
            tests::{assert_placement, run_placement},
        },
        traversal::TraversalAnalysis,
    },
};

/// All statement kinds receive costs (universal fallback).
///
/// Tests that the interpreter supports all `RValue` kinds: Load, Binary, Unary,
/// Aggregate (tuple/struct/closure), Apply, and Input. Every assignment gets
/// a cost because the interpreter is the universal fallback target.
#[test]
fn all_statements_supported() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(42);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?],
             x: Int, y: Int, sum: Int, neg: Int,
             tup: (Int, Int), s: (a: Int, b: Int),
             capture: (Int), func: [fn(Int) -> Int], call_result: Int,
             param: Int, result: Bool;

        bb0() {
            x = load 10;
            y = load 20;
            sum = bin.+ x y;
            neg = un.neg sum;
            tup = tuple 1, 2;
            s = struct a: 3, b: 4;
            capture = load env;
            func = closure def_id capture;
            call_result = apply func, 5;
            param = input.load! "param";
            result = load true;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = TraversalAnalysis::traversal_analysis_in(&context, &body, context.heap);
    let mut placement = InterpreterStatementPlacement::new(&traversals);
    let (body, statement_costs) = run_placement(&context, &mut placement, body);

    assert_placement(
        "all_statements_supported",
        "interpret",
        &body,
        &context,
        &statement_costs,
    );
}

/// A single vertex projection yields cost 12 (base 8 + overhead 4 × 1 path).
///
/// Tests that `path_count` from `TraversalAnalysis` feeds into the interpreter cost
/// formula. A constant load at the same location has cost 8 (zero paths).
#[test]
fn traversal_single_path_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], archived: Bool, result: Bool;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool;

        bb0() {
            archived = load archived_proj;
            result = un.! archived;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = TraversalAnalysis::traversal_analysis_in(&context, &body, context.heap);
    let mut placement = InterpreterStatementPlacement::new(&traversals);
    let (body, statement_costs) = run_placement(&context, &mut placement, body);

    assert_placement(
        "traversal_single_path_cost",
        "interpret",
        &body,
        &context,
        &statement_costs,
    );
}

/// Two vertex projections in a single statement yield cost 16 (base 8 + overhead 4 × 2 paths).
///
/// A tuple referencing both `_1.properties` and `_1.metadata.archived` has `path_count = 2`.
#[test]
fn traversal_multiple_paths_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> (?, Bool) {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             single: ?, both: (?, Bool);
        @proj properties = vertex.properties: ?,
              metadata = vertex.metadata: ?,
              archived = metadata.archived: Bool;

        bb0() {
            single = load properties;
            both = tuple properties, archived;
            return both;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = TraversalAnalysis::traversal_analysis_in(&context, &body, context.heap);
    let mut placement = InterpreterStatementPlacement::new(&traversals);
    let (body, statement_costs) = run_placement(&context, &mut placement, body);

    assert_placement(
        "traversal_multiple_paths_cost",
        "interpret",
        &body,
        &context,
        &statement_costs,
    );
}

/// Composite swallowing reduces `path_count` and therefore interpreter cost.
///
/// A tuple referencing `_1.metadata.record_id.entity_id.web_id` and
/// `_1.metadata.record_id`: `RecordId` swallows `WebId`, so `path_count = 1`
/// and cost = 12, not 16.
#[test]
fn traversal_swallowing_reduces_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> (?, ?) {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], result: (?, ?);
        @proj metadata = vertex.metadata: ?,
              record_id = metadata.record_id: ?,
              entity_id = record_id.entity_id: ?,
              web_id = entity_id.web_id: ?;

        bb0() {
            result = tuple web_id, record_id;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = TraversalAnalysis::traversal_analysis_in(&context, &body, context.heap);
    let mut placement = InterpreterStatementPlacement::new(&traversals);
    let (body, statement_costs) = run_placement(&context, &mut placement, body);

    assert_placement(
        "traversal_swallowing_reduces_cost",
        "interpret",
        &body,
        &context,
        &statement_costs,
    );
}

/// Statements without vertex access are unaffected by traversal costing.
///
/// A body with vertex projections in one statement and pure constants in another.
/// The constant-only statement still gets base cost 8 (`path_count = 0`).
#[test]
fn non_traversal_unaffected_by_costs() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             props: ?, x: Int, result: Bool;
        @proj properties = vertex.properties: ?;

        bb0() {
            props = load properties;
            x = load 42;
            result = bin.> x 10;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = TraversalAnalysis::traversal_analysis_in(&context, &body, context.heap);
    let mut placement = InterpreterStatementPlacement::new(&traversals);
    let (body, statement_costs) = run_placement(&context, &mut placement, body);

    assert_placement(
        "non_traversal_unaffected_by_costs",
        "interpret",
        &body,
        &context,
        &statement_costs,
    );
}

/// `StorageLive`/`StorageDead`/`Nop` get `cost!(0)`, assignments get `cost!(8)`.
///
/// Tests the cost differentiation: storage management statements have zero cost
/// because they don't perform computation, while assignments have cost 8.
#[test]
fn storage_statements_zero_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], x: Int, y: Int, result: Int;

        bb0() {
            let (x.local);
            x = load 10;
            let (y.local);
            y = load 20;
            result = bin.+ x y;
            drop (x.local);
            drop (y.local);
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = TraversalAnalysis::traversal_analysis_in(&context, &body, context.heap);
    let mut placement = InterpreterStatementPlacement::new(&traversals);
    let (body, statement_costs) = run_placement(&context, &mut placement, body);

    assert_placement(
        "storage_statements_zero_cost",
        "interpret",
        &body,
        &context,
        &statement_costs,
    );
}
