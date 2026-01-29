//! Tests for [`InterpreterStatementPlacement`].

use hashql_core::{heap::Heap, r#type::environment::Environment};

use super::{assert_placement, run_placement};
use crate::{
    builder::body, context::MirContext, intern::Interner,
    pass::analysis::execution::statement_placement::InterpreterStatementPlacement,
};

/// All statement kinds receive costs (universal fallback).
///
/// The interpreter supports ALL statements unconditionally.
#[test]
fn all_statements_supported() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Create body with all statement types the macro supports:
    // - StorageLive (let)
    // - StorageDead (drop)
    // - Assign (various rvalue forms)
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), result: Bool, temp: Int;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            let result;
            let temp;
            result = load true;
            temp = bin.+ vertex_0 1;
            drop temp;
            drop result;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: hashql_diagnostics::Diagnostics::new(),
    };

    let (body, statement_costs, traversal_costs) =
        run_placement::<InterpreterStatementPlacement>(&heap, &interner, &env, body);

    assert_placement::<InterpreterStatementPlacement, _>(
        "all_statements_supported",
        "interpret",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// `StorageLive`/`StorageDead` get `cost!(0)`, assignments get `cost!(8)`.
///
/// Verifies the cost differentiation between storage statements and assignments.
#[test]
fn storage_statements_zero_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Create body with mixed storage and assignment statements
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), result: Bool, x: Int, y: Int;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            // StorageLive statements - should get cost 0
            let result;
            let x;
            let y;

            // Assignment statements - should get cost 8
            x = load 42;
            y = bin.+ vertex_0 x;
            result = bin.== y 100;

            // StorageDead statements - should get cost 0
            drop x;
            drop y;

            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: hashql_diagnostics::Diagnostics::new(),
    };

    let (body, statement_costs, traversal_costs) =
        run_placement::<InterpreterStatementPlacement>(&heap, &interner, &env, body);

    assert_placement::<InterpreterStatementPlacement, _>(
        "storage_statements_zero_cost",
        "interpret",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}
