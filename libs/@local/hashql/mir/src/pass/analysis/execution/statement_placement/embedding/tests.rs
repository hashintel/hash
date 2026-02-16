//! Tests for [`EmbeddingStatementPlacement`].
#![expect(clippy::min_ident_chars)]

use hashql_core::{heap::Heap, symbol::sym, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;

use crate::{
    builder::body,
    context::MirContext,
    def::DefId,
    intern::Interner,
    pass::analysis::execution::statement_placement::{
        EmbeddingStatementPlacement,
        tests::{assert_placement, run_placement},
    },
};

/// Only `entity.encodings.vectors` projection is supported.
///
/// Tests that the embedding backend only supports loading from the `encodings.vectors`
/// path on entities. This is the only field stored in the embedding database.
#[test]
fn only_vectors_projection_supported() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], vectors: ?;
        @proj encodings = vertex.encodings: ?, vectors_proj = encodings.vectors: ?;

        bb0() {
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

    let mut placement = EmbeddingStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "only_vectors_projection_supported",
        "embedding",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Both env (local 0) and entity (local 1) are excluded from the dispatchable set.
///
/// Tests that `initialize_boundary` removes both argument locals from the domain.
/// The embedding backend cannot receive any arguments directly - it only accesses
/// entity fields through projections.
#[test]
fn all_args_excluded() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?], env_val: Int, result: Bool;
        @proj env_0 = env.0: Int;

        bb0() {
            env_val = load env_0;
            result = bin.== env_val 42;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = EmbeddingStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "all_args_excluded",
        "embedding",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Entity projections other than `encodings.vectors` are rejected.
///
/// Tests that accessing entity fields like `metadata.archived` or `properties`
/// returns no cost for embedding - these paths map to Postgres, not Embedding.
#[test]
fn non_vectors_entity_projection_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], archived: Bool;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool;

        bb0() {
            archived = load archived_proj;
            return archived;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = EmbeddingStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "non_vectors_entity_projection_rejected",
        "embedding",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// `StorageLive`/`StorageDead` statements get `cost!(0)`.
///
/// Tests that storage management statements have zero cost even for Embedding,
/// matching the interpreter behavior.
#[test]
fn storage_statements_zero_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], vectors: ?;
        @proj encodings = vertex.encodings: ?, vectors_proj = encodings.vectors: ?;

        bb0() {
            let (vectors.local);
            vectors = load vectors_proj;
            drop (vectors.local);
            return vectors;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = EmbeddingStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "storage_statements_zero_cost",
        "embedding",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// All operations except `Load` of vectors projection are rejected.
///
/// Tests that Binary, Unary, Aggregate, Apply, Input, and constants all return no cost.
/// The embedding backend is extremely limited - it can only load vector data.
#[test]
fn other_operations_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(123);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?],
             x: Int, y: Int, sum: Int, neg: Int,
             tup: (Int, Int), param: Int,
             capture: (Int), func: [fn(Int) -> Int], call_result: Int,
             result: Bool;

        bb0() {
            x = load 10;
            y = load 20;
            sum = bin.+ x y;
            neg = un.neg sum;
            tup = tuple 1, 2;
            param = input.load! "param";
            capture = load env;
            func = closure def_id capture;
            call_result = apply func, 1;
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

    let mut placement = EmbeddingStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "other_operations_rejected",
        "embedding",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}
