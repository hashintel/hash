//! Tests for [`PostgresStatementPlacement`].
#![expect(clippy::min_ident_chars, clippy::similar_names)]

use hashql_core::{
    heap::Heap,
    symbol::sym,
    r#type::{TypeId, builder::TypeBuilder, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;

use crate::{
    body::{
        Source,
        operand::Operand,
        terminator::{GraphRead, GraphReadHead, GraphReadTail, TerminatorKind},
    },
    builder::{BodyBuilder, body},
    context::MirContext,
    def::DefId,
    intern::Interner,
    op,
    pass::{
        execution::statement_placement::{
            PostgresStatementPlacement, StatementPlacement as _,
            tests::{assert_placement, run_placement},
        },
        transform::Traversals,
    },
};

/// Arithmetic and comparison operations work.
///
/// Tests that `Binary` and `Unary` `RValue`s are supported when operands are constants
/// or come from dispatchable locals. Uses only constants to isolate the operator support.
#[test]
fn binary_unary_ops_supported() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], x: Int, y: Int, sum: Int, cond: Bool, neg_cond: Bool;

        bb0() {
            x = load 10;
            y = load 20;
            sum = bin.+ x y;
            cond = bin.> sum 15;
            neg_cond = un.! cond;
            return neg_cond;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "binary_unary_ops_supported",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Tuple and struct aggregates work (constructed as JSONB in Postgres).
///
/// Tests that `Aggregate` `RValue`s with `Tuple` and `Struct` kinds are supported.
/// These can be serialized to JSONB in Postgres.
#[test]
fn aggregate_tuple_supported() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], tup: (Int, Int), s: (a: Int, b: Int), result: Bool;

        bb0() {
            tup = tuple 1, 2;
            s = struct a: 10, b: 20;
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

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "aggregate_tuple_supported",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// `Closure` aggregate returns `None` (closures cannot be pushed to Postgres).
///
/// Tests that `Aggregate` `RValue`s with `Closure` kind return no cost.
/// Closures contain function pointers which cannot be serialized to Postgres.
#[test]
fn aggregate_closure_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(42);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: Int, vertex: [Opaque sym::path::Entity; ?], closure_env: Int, closure: [fn(Int) -> Int], result: Bool;

        bb0() {
            closure_env = load env;
            closure = closure def_id closure_env;
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

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "aggregate_closure_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Function calls (`Apply`) are never supported by Postgres.
///
/// Tests that `RValue::Apply` always returns no cost, regardless of whether its
/// operands are supported. Postgres cannot execute arbitrary function calls.
/// Uses an environment with a simple type (no closure) to ensure the function
/// operand itself is dispatchable, isolating that Apply is the unsupported part.
#[test]
fn apply_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(99);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: Int, vertex: [Opaque sym::path::Entity; ?], capture: Int, func: [fn(Int) -> Int], result: Int, cond: Bool;

        bb0() {
            capture = load env;
            func = closure def_id capture;
            result = apply func, 42;
            cond = bin.== result 0;
            return cond;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "apply_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// `RValue::Input` (query parameters) works.
///
/// Tests that `RValue::Input` is supported. Query parameters are passed to Postgres
/// as bound parameters in prepared statements.
#[test]
fn input_supported() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], param: Int, result: Bool;

        bb0() {
            param = input.load! "threshold";
            result = bin.> param 100;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "input_supported",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Environment argument (local 0) containing closure type is excluded from dispatchable set.
///
/// Tests that `HasClosureVisitor` correctly detects closure types nested in the environment
/// type and removes local 0 from the dispatchable set. Even accessing non-closure fields
/// of an env that contains closures is rejected.
#[test]
fn env_with_closure_type_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int, [fn(Int) -> Int]), vertex: [Opaque sym::path::Entity; ?], val: Int, result: Bool;
        @proj env_int = env.0: Int;

        bb0() {
            val = load env_int;
            result = bin.== val 42;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "env_with_closure_type_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Environment argument with simple types is included in dispatchable set.
///
/// Tests that when the environment type contains no closures, local 0 remains in the
/// dispatchable set and can be accessed. Contrast with `env_with_closure_type_rejected`.
#[test]
fn env_without_closure_accepted() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int, Bool), vertex: [Opaque sym::path::Entity; ?], val: Int, result: Bool;
        @proj env_int = env.0: Int;

        bb0() {
            val = load env_int;
            result = bin.== val 42;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "env_without_closure_accepted",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Entity field projections mapping to Postgres columns are supported.
///
/// Tests that projecting `entity.metadata.archived` returns a cost since `archived`
/// maps to a direct Postgres column in `entity_editions`.
#[test]
fn entity_projection_column() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Access entity.metadata.archived which maps to a Postgres column
    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?];
        @proj metadata = vertex.metadata: ?, archived = metadata.archived: Bool;

        bb0() {
            return archived;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "entity_projection_column",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Entity field projections mapping to JSONB paths are supported.
///
/// Tests that projecting `entity.properties` returns a cost since `properties`
/// maps to a JSONB column in `entity_editions`.
#[test]
fn entity_projection_jsonb() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Access entity.properties which maps to JSONB in Postgres
    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], props: ?;
        @proj properties = vertex.properties: ?;

        bb0() {
            props = load properties;
            return props;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "entity_projection_jsonb",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// `StorageLive`/`StorageDead` statements get `cost!(0)`.
///
/// Tests that storage management statements have zero cost even for Postgres,
/// matching the interpreter behavior.
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

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "storage_statements_zero_cost",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// If one branch has an unsupported op, local is excluded from dispatchable set (must analysis).
///
/// Diamond CFG: both branches converge at bb3. One branch (bb1) assigns `x` via a supported
/// operation (`load 42`), while the other (bb2) assigns `x` via an unsupported operation
/// (`apply`). The must analysis requires that a local be supported on ALL paths to be in
/// the dispatchable set. Since bb2's assignment is unsupported, `x` at bb3 cannot be
/// guaranteed dispatchable.
///
/// Uses env without closures so that local 0 is in the dispatchable set, isolating the
/// must-analysis behavior from closure exclusion.
#[test]
fn diamond_must_analysis() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(77);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?], cond: Bool, capture: (Int), func: [fn(Int) -> Int], x: Int, result: Bool;

        bb0() {
            cond = load true;
            capture = load env;
            func = closure def_id capture;
            if cond then bb1() else bb2();
        },
        bb1() {
            x = load 42;
            goto bb3(x);
        },
        bb2() {
            x = apply func, 1;
            goto bb3(x);
        },
        bb3(x) {
            result = bin.== x 0;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::default();
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "diamond_must_analysis",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Values flowing through `GraphRead` edges become unsupported.
///
/// Tests that `transfer_graph_read_edge` correctly marks target block parameters as
/// non-dispatchable. Graph reads must be executed by the interpreter, so any value
/// produced by a graph read cannot be pushed to Postgres.
///
/// Uses fluent builder API because `GraphRead` terminator is not supported by the `body!` macro.
#[test]
fn graph_read_edge_unsupported() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let int_ty = TypeBuilder::synthetic(&env).integer();
    let bool_ty = TypeBuilder::synthetic(&env).boolean();
    let unit_ty = TypeBuilder::synthetic(&env).tuple([] as [TypeId; 0]);
    let entity_ty = TypeBuilder::synthetic(&env).opaque(sym::path::Entity, bool_ty);

    let mut builder = BodyBuilder::new(&interner);

    let _env_local = builder.local("env", unit_ty);
    let vertex = builder.local("vertex", entity_ty);
    let axis = builder.local("axis", int_ty);
    let graph_result = builder.local("graph_result", int_ty);
    let local_val = builder.local("local_val", int_ty);
    let sum = builder.local("sum", int_ty);
    let result = builder.local("result", bool_ty);

    let const_10 = builder.const_int(10);
    let const_0 = builder.const_int(0);

    let bb0 = builder.reserve_block([]);
    let bb1 = builder.reserve_block([graph_result.local]);

    builder
        .build_block(bb0)
        .assign_place(axis, |rv| rv.load(const_10))
        .assign_place(local_val, |rv| rv.load(const_10))
        .finish_with_terminator(TerminatorKind::GraphRead(GraphRead {
            head: GraphReadHead::Entity {
                axis: Operand::Place(axis),
            },
            body: Vec::new_in(&heap),
            tail: GraphReadTail::Collect,
            target: bb1,
        }));

    builder
        .build_block(bb1)
        .assign_place(sum, |rv| rv.binary(graph_result, op![+], local_val))
        .assign_place(result, |rv| rv.binary(sum, op![>], const_0))
        .ret(result);

    let mut body = builder.finish(2, bool_ty);
    body.source = Source::GraphReadFilter(hashql_hir::node::HirId::PLACEHOLDER);

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = Traversals::with_capacity_in(vertex.local, body.local_decls.len(), &heap);

    let mut placement = PostgresStatementPlacement::default();
    let (traversal_costs, statement_costs) =
        placement.statement_placement(&context, &body, &traversals, &heap);

    assert_placement(
        "graph_read_edge_unsupported",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}
