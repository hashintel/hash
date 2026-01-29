//! Tests for [`InterpreterStatementPlacement`].
#![expect(clippy::min_ident_chars)]

use hashql_core::{heap::Heap, symbol::sym, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;

use crate::{
    builder::body,
    context::MirContext,
    def::DefId,
    intern::Interner,
    pass::analysis::execution::statement_placement::{
        InterpreterStatementPlacement,
        tests::{assert_placement, run_placement},
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

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = InterpreterStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "all_statements_supported",
        "interpret",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
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

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = InterpreterStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "storage_statements_zero_cost",
        "interpret",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}
