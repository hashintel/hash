//! Tests for [`InterpreterStatementPlacement`].
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;

use hashql_core::{heap::Heap, symbol::sym, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;

use crate::{
    builder::body,
    context::MirContext,
    def::DefId,
    intern::Interner,
    pass::{
        Changed, TransformPass as _,
        execution::{
            TraversalCostVec,
            statement_placement::{
                InterpreterStatementPlacement, StatementPlacement as _,
                tests::{assert_placement, run_placement},
            },
            target::{TargetArray, TargetId},
        },
        transform::TraversalExtraction,
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

    let traversal_costs = TargetArray::from_fn(|_| None);
    let mut placement: InterpreterStatementPlacement<'_, Global> =
        InterpreterStatementPlacement::new(&traversal_costs);
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

    let traversal_costs = TargetArray::from_fn(|_| None);
    let mut placement: InterpreterStatementPlacement<'_, Global> =
        InterpreterStatementPlacement::new(&traversal_costs);
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

/// Traversal locals receive the backend cost added to the base interpreter cost.
///
/// When Postgres assigns a traversal cost of 4, the interpreter adds it to the base cost (8)
/// via `saturating_add`, yielding 12 for the traversal assignment. Non-traversal assignments
/// remain at the base cost.
#[test]
fn traversal_single_backend_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], result: Bool;
        @proj metadata = vertex.metadata: ?, archived = metadata.archived: Bool;

        bb0() {
            result = un.! archived;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut extraction = TraversalExtraction::new_in(Global);
    let _: Changed = extraction.run(&mut context, &mut body);
    let traversals = extraction
        .take_traversals()
        .expect("expected GraphReadFilter body");

    let mut postgres_costs = TraversalCostVec::new_in(&body, &traversals, &heap);
    for local in body.local_decls.ids() {
        if traversals.contains(local) {
            postgres_costs.insert(local, cost!(4));
        }
    }

    let mut traversal_costs: TargetArray<Option<TraversalCostVec<&Heap>>> =
        TargetArray::from_fn(|_| None);
    traversal_costs[TargetId::Postgres] = Some(postgres_costs);

    let mut interpreter = InterpreterStatementPlacement::new(&traversal_costs);
    let (traversal_cost_out, statement_costs) =
        interpreter.statement_placement_in(&context, &body, &traversals, &heap);

    assert_placement(
        "traversal_single_backend_cost",
        "interpret",
        &body,
        &context,
        &statement_costs,
        &traversal_cost_out,
    );
}

/// The interpreter picks the maximum traversal cost across all backends.
///
/// With Postgres assigning cost 4 and Embedding assigning cost 6 to different traversal
/// locals, the interpreter adds the per-local maximum to its base cost. Each traversal
/// assignment reflects the worst-case backend cost for that specific local.
#[test]
fn traversal_worst_case_multiple_backends() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], archived: Bool, vectors: ?;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool,
              encodings = vertex.encodings: ?, vectors_proj = encodings.vectors: ?;

        bb0() {
            archived = load archived_proj;
            vectors = load vectors_proj;
            return vectors;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut extraction = TraversalExtraction::new_in(Global);
    let _: Changed = extraction.run(&mut context, &mut body);
    let traversals = extraction
        .take_traversals()
        .expect("expected GraphReadFilter body");

    // Assign different costs per backend per local so the interpreter picks the max for each.
    // First traversal local gets Postgres cost 4, second gets Embedding cost 6.
    let mut postgres_costs = TraversalCostVec::new_in(&body, &traversals, &heap);
    let mut embedding_costs = TraversalCostVec::new_in(&body, &traversals, &heap);
    let traversal_locals: Vec<_> = body
        .local_decls
        .ids()
        .filter(|local| traversals.contains(*local))
        .collect();
    postgres_costs.insert(traversal_locals[0], cost!(4));
    embedding_costs.insert(traversal_locals[1], cost!(6));

    let mut traversal_costs: TargetArray<Option<TraversalCostVec<&Heap>>> =
        TargetArray::from_fn(|_| None);
    traversal_costs[TargetId::Postgres] = Some(postgres_costs);
    traversal_costs[TargetId::Embedding] = Some(embedding_costs);

    let mut interpreter = InterpreterStatementPlacement::new(&traversal_costs);
    let (traversal_cost_out, statement_costs) =
        interpreter.statement_placement_in(&context, &body, &traversals, &heap);

    assert_placement(
        "traversal_worst_case_multiple_backends",
        "interpret",
        &body,
        &context,
        &statement_costs,
        &traversal_cost_out,
    );
}

/// Non-traversal assignments are unaffected by traversal costs.
///
/// Even when traversal costs are present for entity projection locals, assignments to
/// non-traversal locals (like arithmetic results) retain the base interpreter cost of 8.
#[test]
fn non_traversal_unaffected_by_costs() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             archived: Bool, x: Int, y: Int, sum: Int, result: Bool;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool;

        bb0() {
            archived = load archived_proj;
            x = load 10;
            y = load 20;
            sum = bin.+ x y;
            result = bin.> sum 15;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut extraction = TraversalExtraction::new_in(Global);
    let _: Changed = extraction.run(&mut context, &mut body);
    let traversals = extraction
        .take_traversals()
        .expect("expected GraphReadFilter body");

    let mut postgres_costs = TraversalCostVec::new_in(&body, &traversals, &heap);
    for local in body.local_decls.ids() {
        if traversals.contains(local) {
            postgres_costs.insert(local, cost!(4));
        }
    }

    let mut traversal_costs: TargetArray<Option<TraversalCostVec<&Heap>>> =
        TargetArray::from_fn(|_| None);
    traversal_costs[TargetId::Postgres] = Some(postgres_costs);

    let mut interpreter = InterpreterStatementPlacement::new(&traversal_costs);
    let (traversal_cost_out, statement_costs) =
        interpreter.statement_placement_in(&context, &body, &traversals, &heap);

    assert_placement(
        "non_traversal_unaffected_by_costs",
        "interpret",
        &body,
        &context,
        &statement_costs,
        &traversal_cost_out,
    );
}
