//! Tests for [`EmbeddingStatementPlacement`].

use hashql_core::{heap::Heap, r#type::environment::Environment};

use super::{assert_placement, run_placement};
use crate::{
    builder::body, context::MirContext, def::DefId, intern::Interner,
    pass::analysis::execution::statement_placement::EmbeddingStatementPlacement,
};

/// Only `encodings.vectors` projections from Entity are supported.
///
/// The embedding backend only handles loading from `entity.encodings.vectors` paths.
/// All other operations should return `None` cost.
// TODO: Entity projection tests require the vertex (local 1) to have an opaque `Entity` type
// with `sym::path::Entity` name. The `body!` macro's `@proj` syntax creates projections with
// numeric field indices, but `entity_projection_access` expects specific symbol names from
// `sym::lexical`. To properly test entity projections, we need either:
//   - Extension of the `body!` macro to support chained named field projections
//   - Direct use of the builder API (BodyBuilder) to construct projections manually
//
// See also: lookup/tests.rs for unit tests of `entity_projection_access` that test
// the path lookup logic directly without needing full MIR construction.
#[test]
fn only_vectors_projection_supported() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Without Entity type support in body! macro, we can only verify that
    // non-entity operations get None cost. Entity projection support would
    // require proper opaque type setup with sym::path::Entity name.
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: (Int, Int), x: Int, result: Bool;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            // Loading from non-Entity projection - should get None cost
            x = load vertex_0;
            result = bin.== x 42;
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
        run_placement::<EmbeddingStatementPlacement>(&heap, &interner, &env, body);

    assert_placement::<EmbeddingStatementPlacement, _>(
        "only_vectors_projection_supported",
        "embedding",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Both environment (local 0) and entity (local 1) arguments are excluded from transferable set.
///
/// The embedding backend cannot receive any arguments directly - it only supports
/// entity.encodings.vectors projections which are handled specially.
#[test]
fn all_args_excluded() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Both env (local 0) and vertex (local 1) should be excluded from dispatchable set
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: Int, vertex: (Int, Int), env_val: Int, vertex_val: Int, result: Bool;
        @proj vertex_0 = vertex.0: Int;

        bb0() {
            // Loading from env argument - should get None (excluded)
            env_val = load env;
            // Loading from vertex projection - should get None (not Entity type)
            vertex_val = load vertex_0;
            result = bin.== env_val vertex_val;
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
        run_placement::<EmbeddingStatementPlacement>(&heap, &interner, &env, body);

    assert_placement::<EmbeddingStatementPlacement, _>(
        "all_args_excluded",
        "embedding",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Binary, Unary, Aggregate, Apply, Input, and constants all return `None` cost.
///
/// The embedding backend only supports loading from Entity encodings.vectors projections.
/// All other RValue kinds are rejected.
#[test]
fn other_operations_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(42);

    // Body with various unsupported operations
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: [fn(Int) -> Int], vertex: (Int, Int),
            const_val: Int, binary_result: Int, unary_result: Bool,
            tuple_result: (Int, Int), apply_result: Int,
            input_val: Int, final_result: Bool;

        bb0() {
            // Constant load - should get None
            const_val = load 42;

            // Binary operation - should get None
            binary_result = bin.+ const_val 10;

            // Unary operation - should get None
            unary_result = bin.== binary_result 0;

            // Aggregate (tuple) - should get None
            tuple_result = tuple const_val, binary_result;

            // Apply (function call) - should get None
            apply_result = apply env, const_val;

            // Input - should get None
            input_val = input.load! "param";

            // Final comparison - should get None
            final_result = bin.== apply_result input_val;

            return final_result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: hashql_diagnostics::Diagnostics::new(),
    };

    let (body, statement_costs, traversal_costs) =
        run_placement::<EmbeddingStatementPlacement>(&heap, &interner, &env, body);

    assert_placement::<EmbeddingStatementPlacement, _>(
        "other_operations_rejected",
        "embedding",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}
