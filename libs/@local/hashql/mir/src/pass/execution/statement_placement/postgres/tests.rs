//! Tests for [`PostgresStatementPlacement`].
#![expect(clippy::min_ident_chars, clippy::similar_names)]

use alloc::alloc::Global;

use hashql_core::{
    heap::Heap,
    symbol::sym,
    r#type::{
        RecursionBoundary, TypeId,
        builder::{TypeBuilder, lazy},
        environment::Environment,
        visit::{RecursiveVisitorGuard, Visitor as _},
    },
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?], closure_env: Int, closure: [fn(Int) -> Int], result: Bool;
        @proj env_int = env.0: Int;

        bb0() {
            closure_env = load env_int;
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?], capture: Int, func: [fn(Int) -> Int], result: Int, cond: Bool;
        @proj env_int = env.0: Int;

        bb0() {
            capture = load env_int;
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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

/// Environment field containing a closure type is excluded from `env_domain`.
///
/// The env is `(Int, fn(Int) -> Int)`. Field 0 (Int) is transferable, but
/// field 1 (closure) is not. Since this test only accesses field 0, the
/// projection is supported and gets a cost.
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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

/// Environment fields with simple types are included in `env_domain`.
///
/// The env is `(Int, Bool)`. Both fields contain no closures or non-string dict keys,
/// so projecting field 0 is supported. Contrast with `env_with_closure_type_rejected`.
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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
/// Uses env without closures so that the env field is in the dispatchable set, isolating the
/// must-analysis behavior from closure exclusion.
#[test]
fn diamond_must_analysis() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let def_id = DefId::new(77);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?], cond: Bool, env_val: Int, capture: (Int), func: [fn(Int) -> Int], x: Int, result: Bool;
        @proj env_int = env.0: Int;

        bb0() {
            cond = load true;
            env_val = load env_int;
            capture = tuple env_val;
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (traversal_costs, statement_costs) =
        placement.statement_placement_in(&context, &body, &traversals, &heap);

    assert_placement(
        "graph_read_edge_unsupported",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Accessing the closure field of a mixed env is rejected, while the Int field is accepted.
///
/// The env is `(Int, fn(Int) -> Int)`. Field 0 is transferable, field 1 is not.
/// Accessing field 1 (the closure) produces no cost, while field 0 gets a cost.
#[test]
fn env_closure_field_rejected_other_accepted() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int, [fn(Int) -> Int]), vertex: [Opaque sym::path::Entity; ?], val: Int, closure_val: [fn(Int) -> Int], result: Bool;
        @proj env_int = env.0: Int, env_closure = env.1: [fn(Int) -> Int];

        bb0() {
            val = load env_int;
            closure_val = load env_closure;
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "env_closure_field_rejected_other_accepted",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Environment field containing a dict with non-string keys is rejected.
///
/// jsonb object keys must be strings; `Dict<Int, Int>` cannot be serialized.
/// The env is `(Dict<Int, Int>)`, so field 0 is excluded from `env_domain`.
#[test]
fn env_dict_non_string_key_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([Dict Int Int]), vertex: [Opaque sym::path::Entity; ?], val: [Dict Int Int], result: Bool;
        @proj env_dict = env.0: [Dict Int Int];

        bb0() {
            val = load env_dict;
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "env_dict_non_string_key_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Environment field containing a dict with string keys is accepted.
///
/// `Dict<String, Int>` can be serialized to jsonb (string keys map to object keys).
#[test]
fn env_dict_string_key_accepted() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([Dict String Int]), vertex: [Opaque sym::path::Entity; ?], val: [Dict String Int], result: Bool;
        @proj env_dict = env.0: [Dict String Int];

        bb0() {
            val = load env_dict;
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "env_dict_string_key_accepted",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Dict with opaque string key is accepted after peeling.
///
/// The key type is `Opaque<String>`. The `peel` method strips the opaque wrapper
/// to reveal the underlying `String`, so the dict is transferable.
#[test]
fn env_dict_opaque_string_key_accepted() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([Dict [Opaque sym::path::Entity; String] Int]),
             vertex: [Opaque sym::path::Entity; ?],
             val: [Dict [Opaque sym::path::Entity; String] Int],
             result: Bool;
        @proj env_dict = env.0: [Dict [Opaque sym::path::Entity; String] Int];

        bb0() {
            val = load env_dict;
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "env_dict_opaque_string_key_accepted",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Dict with union key where all variants peel to `String` is accepted by `SupportedVisitor`.
///
/// The key type is `Opaque1<String> | Opaque2<String>`. Since both variants peel
/// to `String` under structural peeling, the union collapses and the dict is
/// considered transferable by the env-domain check.
#[test]
fn env_dict_union_string_key_accepted() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let int_ty = builder.integer();
    let opaque_a = builder.opaque(sym::path::Entity, str_ty);
    let opaque_b = builder.opaque(sym::path::Entity, str_ty);
    let union_key = builder.union([opaque_a, opaque_b]);
    let dict_ty = builder.dict(union_key, int_ty);

    let mut guard = RecursiveVisitorGuard::new();
    let result = super::SupportedVisitor {
        env: &env,
        guard: &mut guard,
    }
    .visit_id(dict_ty);

    assert!(result.is_continue());
}

/// `Constant::FnPtr` is rejected by Postgres.
///
/// Function pointer constants cannot be serialized to Postgres. Loading a `DefId`
/// produces a `FnPtr` constant, which `is_supported_constant` rejects.
#[test]
fn fnptr_constant_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], func: [fn(Int) -> Int], result: Bool;

        bb0() {
            func = load callee_id;
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

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "fnptr_constant_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Equality comparison between `Dict<String, _>` and struct is rejected.
///
/// Both types serialize to jsonb objects, so `dict("a" = 2) == struct { a: 2 }` would
/// produce `true` in Postgres but `false` in the interpreter (different types).
#[test]
fn eq_dict_vs_struct_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([Dict String Int], (a: Int)),
             vertex: [Opaque sym::path::Entity; ?],
             dict_val: [Dict String Int],
             struct_val: (a: Int),
             result: Bool;
        @proj env_dict = env.0: [Dict String Int], env_struct = env.1: (a: Int);

        bb0() {
            dict_val = load env_dict;
            struct_val = load env_struct;
            result = bin.== dict_val struct_val;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "eq_dict_vs_struct_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Equality comparison between `List<_>` and tuple is rejected.
///
/// Both types serialize to jsonb arrays, so `[1, 2]` as a list and `(1, 2)` as a tuple
/// would both become `[1, 2]` in Postgres.
#[test]
fn eq_list_vs_tuple_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([List Int], (Int, Int)),
             vertex: [Opaque sym::path::Entity; ?],
             list_val: [List Int],
             tuple_val: (Int, Int),
             result: Bool;
        @proj env_list = env.0: [List Int], env_tuple = env.1: (Int, Int);

        bb0() {
            list_val = load env_list;
            tuple_val = load env_tuple;
            result = bin.== list_val tuple_val;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "eq_list_vs_tuple_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Equality comparison involving an unknown type is rejected.
///
/// When either operand has type `?`, we cannot prove the comparison is representationally
/// safe, so it must stay in the interpreter.
#[test]
fn eq_unknown_type_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int, ?),
             vertex: [Opaque sym::path::Entity; ?],
             int_val: Int,
             unknown_val: ?,
             result: Bool;
        @proj env_int = env.0: Int, env_unknown = env.1: ?;

        bb0() {
            int_val = load env_int;
            unknown_val = load env_unknown;
            result = bin.== int_val unknown_val;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "eq_unknown_type_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Equality comparison between two values of the same type is accepted.
///
/// Both operands are `Int`, which has a single unambiguous jsonb representation.
/// The `TypeId` equality short-circuit handles this before any type walking.
#[test]
fn eq_same_type_accepted() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (Int, Int),
             vertex: [Opaque sym::path::Entity; ?],
             val_a: Int,
             val_b: Int,
             result: Bool;
        @proj env_a = env.0: Int, env_b = env.1: Int;

        bb0() {
            val_a = load env_a;
            val_b = load env_b;
            result = bin.== val_a val_b;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "eq_same_type_accepted",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Inequality (`!=`) is also subject to equality safety checks.
///
/// The code handles `BinOp::Eq | BinOp::Ne` in the same arm. This test verifies
/// that `!=` between representationally colliding types is rejected just like `==`.
#[test]
fn ne_dict_vs_struct_rejected() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([Dict String Int], (a: Int)),
             vertex: [Opaque sym::path::Entity; ?],
             dict_val: [Dict String Int],
             struct_val: (a: Int),
             result: Bool;
        @proj env_dict = env.0: [Dict String Int], env_struct = env.1: (a: Int);

        bb0() {
            dict_val = load env_dict;
            struct_val = load env_struct;
            result = bin.!= dict_val struct_val;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "ne_dict_vs_struct_rejected",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

// =============================================================================
// Unit tests for `is_equality_safe`
// =============================================================================

/// Same `TypeId` short-circuits before any type walking.
#[test]
fn eq_safe_same_type_id() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        int_ty,
        int_ty
    ));
}

/// Two different `TypeId`s that peel to the same interned kind are safe via `ptr::eq`.
///
/// Uses Apply wrappers (not Opaque) since semantic peel preserves opaques but strips Apply.
/// Both Apply types peel to the same interned Integer kind.
#[test]
fn eq_safe_ptr_eq_after_peel() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let param_a = builder.fresh_argument("A");
    let param_b = builder.fresh_argument("B");
    let generic_a = builder.generic([(param_a, None)], int_ty);
    let generic_b = builder.generic([(param_b, None)], int_ty);

    // Different TypeIds, but both peel to the same interned Integer kind
    assert_ne!(generic_a, generic_b);
    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        generic_a,
        generic_b
    ));
}

/// Union where all variants are safe against the other operand.
#[test]
fn eq_safe_union_all_safe() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let bool_ty = builder.boolean();
    let union_ty = builder.union([int_ty, bool_ty]);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        union_ty,
        int_ty
    ));
}

/// Union where one variant collides with the other operand.
#[test]
fn eq_unsafe_union_has_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_ty = builder.dict(str_ty, int_ty);
    let union_ty = builder.union([dict_ty, int_ty]);
    let struct_ty = builder.r#struct([("a", int_ty)]);

    // Union contains Dict<String, Int> which collides with the struct
    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        union_ty,
        struct_ty
    ));
}

/// Intersection where one variant collides.
#[test]
fn eq_unsafe_intersection_has_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_ty = builder.dict(str_ty, int_ty);
    let intersection_ty = builder.intersection([dict_ty, int_ty]);
    let struct_ty = builder.r#struct([("a", int_ty)]);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        intersection_ty,
        struct_ty
    ));
}

/// Tuples with different lengths are always safe (different jsonb array sizes).
#[test]
fn eq_safe_tuple_different_length() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let tuple2 = builder.tuple([int_ty, int_ty]);
    let tuple3 = builder.tuple([int_ty, int_ty, int_ty]);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        tuple2,
        tuple3
    ));
}

/// Structs with different field counts are always safe.
#[test]
fn eq_safe_struct_different_length() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let struct1 = builder.r#struct([("a", int_ty)]);
    let struct2 = builder.r#struct([("a", int_ty), ("b", int_ty)]);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        struct1,
        struct2
    ));
}

/// Structs with different field names are always safe (different jsonb key sets).
#[test]
fn eq_safe_struct_different_names() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let struct_a = builder.r#struct([("a", int_ty)]);
    let struct_b = builder.r#struct([("b", int_ty)]);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        struct_a,
        struct_b
    ));
}

/// Dicts with the same key and value types are safe.
#[test]
fn eq_safe_dict_same_types() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_a = builder.dict(str_ty, int_ty);
    let dict_b = builder.dict(str_ty, int_ty);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        dict_a,
        dict_b
    ));
}

/// Lists with the same element type are safe.
#[test]
fn eq_safe_list_same_element() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let list_a = builder.list(int_ty);
    let list_b = builder.list(int_ty);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        list_a,
        list_b
    ));
}

/// Dicts recurse into key and value types.
#[test]
fn eq_unsafe_dict_value_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let inner_dict = builder.dict(str_ty, int_ty);
    let inner_struct = builder.r#struct([("a", int_ty)]);

    // Dict<String, Dict<String, Int>> vs Dict<String, (a: Int)>
    let dict_of_dict = builder.dict(str_ty, inner_dict);
    let dict_of_struct = builder.dict(str_ty, inner_struct);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        dict_of_dict,
        dict_of_struct
    ));
}

/// Lists recurse into element types.
#[test]
fn eq_unsafe_list_element_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let inner_dict = builder.dict(str_ty, int_ty);
    let inner_struct = builder.r#struct([("a", int_ty)]);

    // List<Dict<String, Int>> vs List<(a: Int)>
    let list_of_dict = builder.list(inner_dict);
    let list_of_struct = builder.list(inner_struct);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        list_of_dict,
        list_of_struct
    ));
}

/// Closure types return true (rejected later by operand supportedness).
#[test]
fn eq_safe_closure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let closure_ty = builder.closure([int_ty], int_ty);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        closure_ty,
        int_ty
    ));
}

/// Cross-category (object vs array) is always safe.
#[test]
fn eq_safe_cross_category() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_ty = builder.dict(str_ty, int_ty);
    let tuple_ty = builder.tuple([int_ty, int_ty]);

    // Dict (jsonb object) vs Tuple (jsonb array) → different categories → safe
    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        dict_ty,
        tuple_ty
    ));
}

/// Union on the RHS exercises the second union/intersection match arm.
#[test]
fn eq_unsafe_rhs_union_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_ty = builder.dict(str_ty, int_ty);
    let union_ty = builder.union([dict_ty, int_ty]);
    let struct_ty = builder.r#struct([("a", int_ty)]);

    // Struct on LHS, union on RHS → hits lines 158-164
    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        struct_ty,
        union_ty
    ));
}

/// Tuples with same length recurse into element types.
#[test]
fn eq_unsafe_tuple_same_length_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_ty = builder.dict(str_ty, int_ty);
    let struct_ty = builder.r#struct([("a", int_ty)]);

    // (Int, Dict<String, Int>) vs (Int, (a: Int))
    let tuple_a = builder.tuple([int_ty, dict_ty]);
    let tuple_b = builder.tuple([int_ty, struct_ty]);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        tuple_a,
        tuple_b
    ));
}

/// Tuples with same length and safe element types are accepted.
#[test]
fn eq_safe_tuple_same_length() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let bool_ty = builder.boolean();

    let tuple_a = builder.tuple([int_ty, bool_ty]);
    let tuple_b = builder.tuple([int_ty, bool_ty]);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        tuple_a,
        tuple_b
    ));
}

/// Structs with same names recurse into value types.
#[test]
fn eq_unsafe_struct_same_names_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_ty = builder.dict(str_ty, int_ty);
    let inner_struct = builder.r#struct([("x", int_ty)]);

    // (a: Dict<String, Int>) vs (a: (x: Int))
    let struct_a = builder.r#struct([("a", dict_ty)]);
    let struct_b = builder.r#struct([("a", inner_struct)]);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        struct_a,
        struct_b
    ));
}

/// Structs with same names and safe value types are accepted.
#[test]
fn eq_safe_struct_same_names() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let bool_ty = builder.boolean();

    let struct_a = builder.r#struct([("a", int_ty), ("b", bool_ty)]);
    let struct_b = builder.r#struct([("a", int_ty), ("b", bool_ty)]);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        struct_a,
        struct_b
    ));
}

/// Never type is always safe (values of this type can never exist).
#[test]
fn eq_safe_never() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let never_ty = builder.never();

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        never_ty,
        int_ty
    ));
    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        int_ty,
        never_ty
    ));
}

/// Closure vs closure is safe (rejected later by operand supportedness).
#[test]
fn eq_safe_closure_vs_closure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let closure_a = builder.closure([int_ty], int_ty);
    let closure_b = builder.closure([int_ty, int_ty], int_ty);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        closure_a,
        closure_b
    ));
}

/// Recursive types with identical structure are safe.
///
/// Both `A = (Int, A)` and `B = (Int, B)` have the same recursive shape: a tuple with an
/// integer and a self-reference. The boundary detects the cycle when it encounters the
/// `(A, B)` pair a second time during the recursive field walk, and returns `true`.
#[test]
fn eq_safe_recursive_same_structure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();

    // type A = (Int, A)
    let type_a = builder.tuple(lazy(|self_id, _| [int_ty, self_id.value()]));
    // type B = (Int, B)
    let type_b = builder.tuple(lazy(|self_id, _| [int_ty, self_id.value()]));

    assert_ne!(type_a, type_b);
    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        type_a,
        type_b
    ));
}

/// Recursive types with different structure at the recursion point are unsafe.
///
/// `A = (Dict<String, Int>, A)` and `B = ((a: Int), B)` recurse identically but differ
/// at the first field: Dict vs Struct collides in jsonb. The check rejects before reaching
/// the cycle.
#[test]
fn eq_unsafe_recursive_different_structure() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_ty = builder.dict(str_ty, int_ty);
    let struct_ty = builder.r#struct([("a", int_ty)]);

    // type A = (Dict<String, Int>, A)
    let type_a = builder.tuple(lazy(|self_id, _| [dict_ty, self_id.value()]));
    // type B = ((a: Int), B)
    let type_b = builder.tuple(lazy(|self_id, _| [struct_ty, self_id.value()]));

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        type_a,
        type_b
    ));
}

/// Recursive type compared against a finite type terminates without hitting the boundary.
///
/// `A = (Int, A)` is recursive, `B = (Int, (Int, Bool))` is finite. The traversal follows
/// both sides in lockstep: at the second field, `A` recurses back to `(Int, A)` while `B`
/// has `(Int, Bool)`. The check continues into that pair and reaches primitive leaves (Int vs
/// Int, then A vs Bool where A is a tuple and Bool is a primitive), terminating naturally.
#[test]
fn eq_safe_recursive_vs_finite() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let bool_ty = builder.boolean();

    // type A = (Int, A)
    let type_a = builder.tuple(lazy(|self_id, _| [int_ty, self_id.value()]));
    // type B = (Int, (Int, Bool))
    let inner = builder.tuple([int_ty, bool_ty]);
    let type_b = builder.tuple([int_ty, inner]);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        type_a,
        type_b
    ));
}

/// Equality with a constant operand is always accepted.
///
/// Constants are scalars or null in jsonb, so they never cause representational collisions.
/// The `Place == Constant` path skips the type-walking check entirely.
#[test]
fn eq_place_vs_constant_accepted() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([Dict String Int]),
             vertex: [Opaque sym::path::Entity; ?],
             dict_val: [Dict String Int],
             result: Bool;
        @proj env_dict = env.0: [Dict String Int];

        bb0() {
            dict_val = load env_dict;
            result = bin.== dict_val 42;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "eq_place_vs_constant_accepted",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

// =============================================================================
// Peel tests
// =============================================================================

/// Semantic peel preserves opaque types, returning the opaque wrapper itself.
#[test]
fn peel_semantic_preserves_opaque() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);

    let peeled = super::Peel::semantic(&env, uuid_ty);
    assert!(
        peeled.kind.opaque().is_some(),
        "semantic peel should preserve opaque types"
    );
}

/// Structural peel strips opaque types to their repr.
#[test]
fn peel_structural_strips_opaque() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);

    let peeled = super::Peel::structural(&env, uuid_ty);
    assert!(
        peeled.kind.primitive().is_some(),
        "structural peel should strip opaque to underlying String primitive"
    );
}

/// Semantic peel on a union of opaques with different names does not collapse.
///
/// `Uuid | Email` both have repr `String`, but semantic peel preserves the opaque wrappers.
/// Since `Opaque("Uuid", String)` and `Opaque("Email", String)` have different `TypeKind`s
/// (different names), the union cannot collapse.
#[test]
fn peel_semantic_union_different_opaques_preserved() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);
    let email_ty = builder.opaque("Email", str_ty);
    let union_ty = builder.union([uuid_ty, email_ty]);

    let peeled = super::Peel::semantic(&env, union_ty);
    assert!(
        peeled.kind.union().is_some(),
        "semantic peel should preserve union of differently-named opaques"
    );
}

/// Structural peel on a union of opaques with same repr collapses to that repr.
///
/// `Uuid | Email` both peel structurally to `String`, so the union collapses.
#[test]
fn peel_structural_union_same_repr_collapses() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);
    let email_ty = builder.opaque("Email", str_ty);
    let union_ty = builder.union([uuid_ty, email_ty]);

    let peeled = super::Peel::structural(&env, union_ty);
    assert!(
        peeled.kind.primitive().is_some(),
        "structural peel should collapse union of same-repr opaques to String"
    );
}

/// Semantic peel still strips Generic wrappers.
#[test]
fn peel_semantic_strips_generic() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let mut builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let param = builder.fresh_argument("T");
    let generic_ty = builder.generic([(param, None)], int_ty);

    let peeled = super::Peel::semantic(&env, generic_ty);
    assert!(
        peeled.kind.primitive().is_some(),
        "semantic peel should still strip Generic wrappers"
    );
}

// =============================================================================
// Equality safety: opaque types
// =============================================================================

/// Opaque compared against its own repr type is unsafe.
///
/// `Uuid` (opaque over `String`) vs `String`: both serialize to the same jsonb string,
/// but the interpreter distinguishes them by nominal type. Postgres cannot.
#[test]
fn eq_unsafe_opaque_vs_repr() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        uuid_ty,
        str_ty
    ));
}

/// Two opaques with different names but same repr are unsafe.
///
/// `Uuid` vs `Email`: both are opaque over `String`, but the interpreter considers
/// them distinct types. In jsonb they're both plain strings.
#[test]
fn eq_unsafe_different_opaques_same_repr() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);
    let email_ty = builder.opaque("Email", str_ty);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        uuid_ty,
        email_ty
    ));
}

/// Opaque nested inside a tuple makes the comparison unsafe if the other side has the repr.
///
/// `(Int, Uuid)` vs `(Int, String)`: the second field is `Opaque("Uuid", String)` vs
/// `String`, which is a representational collision.
#[test]
fn eq_unsafe_opaque_nested_in_tuple() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);

    let tuple_with_opaque = builder.tuple([int_ty, uuid_ty]);
    let tuple_with_repr = builder.tuple([int_ty, str_ty]);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        tuple_with_opaque,
        tuple_with_repr
    ));
}

/// Union containing an opaque and its repr is unsafe when compared against any string-like type.
///
/// `Uuid | String` compared against `String`: the union arm `Uuid` vs `String` triggers
/// the opaque-vs-non-opaque rejection.
#[test]
fn eq_unsafe_union_opaque_with_repr() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);
    let union_ty = builder.union([uuid_ty, str_ty]);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        union_ty,
        str_ty
    ));
}

/// Opaque with a compound repr: `Opaque("TaggedPair", (Int, String))` vs `(Int, String)`.
///
/// The opaque wraps a tuple. Compared against a bare tuple of the same shape,
/// Postgres can't tell them apart in jsonb.
#[test]
fn eq_unsafe_opaque_compound_repr_vs_bare() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let tuple_ty = builder.tuple([int_ty, str_ty]);
    let opaque_ty = builder.opaque("TaggedPair", tuple_ty);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        opaque_ty,
        tuple_ty
    ));
}

/// Two opaques with the same name and safe repr types are safe.
///
/// Both sides are `Opaque("Wrapper", Int)` with matching names.
/// The repr types (both Int) are trivially equality-safe.
#[test]
fn eq_safe_same_named_opaques_safe_repr() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let opaque_a = builder.opaque("Wrapper", int_ty);
    let opaque_b = builder.opaque("Wrapper", int_ty);

    assert!(super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        opaque_a,
        opaque_b
    ));
}

/// Same-named opaques whose repr types have a collision are unsafe.
///
/// `Opaque("Wrapper", Dict<String, Int>)` vs `Opaque("Wrapper", (a: Int))`:
/// same opaque name, but the repr types collide (dict vs struct).
#[test]
fn eq_unsafe_same_named_opaques_repr_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_repr = builder.dict(str_ty, int_ty);
    let struct_repr = builder.r#struct([("a", int_ty)]);

    let opaque_a = builder.opaque("Wrapper", dict_repr);
    let opaque_b = builder.opaque("Wrapper", struct_repr);

    assert!(!super::is_equality_safe(
        &env,
        &mut RecursionBoundary::new(),
        opaque_a,
        opaque_b
    ));
}

// =============================================================================
// Type serialization safety tests
// =============================================================================

/// Helper: checks whether a type is serialization-safe using `TypeSerializationSafety`.
fn is_serialization_safe(env: &Environment<'_>, type_id: TypeId) -> bool {
    let mut guard = RecursiveVisitorGuard::new();
    super::TypeSerializationSafety {
        env,
        guard: &mut guard,
    }
    .visit_id(type_id)
    .is_continue()
}

/// Non-union types are always serialization-safe.
#[test]
fn serialization_safe_primitive() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    assert!(is_serialization_safe(&env, builder.integer()));
    assert!(is_serialization_safe(&env, builder.string()));
    assert!(is_serialization_safe(&env, builder.boolean()));
}

/// Bare opaque type (not in a union) is serialization-safe.
#[test]
fn serialization_safe_bare_opaque() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let uuid_ty = builder.opaque("Uuid", builder.string());
    assert!(is_serialization_safe(&env, uuid_ty));
}

/// Struct and tuple types are serialization-safe on their own.
#[test]
fn serialization_safe_struct_and_tuple() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let struct_ty = builder.r#struct([("a", int_ty), ("b", int_ty)]);
    let tuple_ty = builder.tuple([int_ty, int_ty]);

    assert!(is_serialization_safe(&env, struct_ty));
    assert!(is_serialization_safe(&env, tuple_ty));
}

/// Union of primitives is serialization-safe (different jsonb scalar kinds).
#[test]
fn serialization_safe_union_primitives() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let union_ty = builder.union([builder.integer(), builder.boolean()]);
    assert!(is_serialization_safe(&env, union_ty));
}

/// Union of struct and primitive is safe (jsonb object vs scalar).
#[test]
fn serialization_safe_union_struct_and_primitive() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let struct_ty = builder.r#struct([("a", int_ty)]);
    let union_ty = builder.union([struct_ty, int_ty]);

    assert!(is_serialization_safe(&env, union_ty));
}

/// Union containing an opaque is rejected.
///
/// The opaque's repr is likely a subtype of another variant, making them
/// indistinguishable in jsonb.
#[test]
fn serialization_unsafe_union_with_opaque() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);
    let union_ty = builder.union([uuid_ty, str_ty]);

    assert!(!is_serialization_safe(&env, union_ty));
}

/// Union containing an opaque alongside an unrelated type is still rejected.
///
/// Even though `Uuid` (repr `String`) and `Int` have different jsonb representations,
/// we reject conservatively because proving safety would require subtype checking.
#[test]
fn serialization_unsafe_union_opaque_with_unrelated() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let uuid_ty = builder.opaque("Uuid", builder.string());
    let union_ty = builder.union([uuid_ty, builder.integer()]);

    assert!(!is_serialization_safe(&env, union_ty));
}

/// Union of struct and dict is rejected (both serialize as jsonb objects).
#[test]
fn serialization_unsafe_union_struct_and_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let struct_ty = builder.r#struct([("a", int_ty)]);
    let dict_ty = builder.dict(str_ty, int_ty);
    let union_ty = builder.union([struct_ty, dict_ty]);

    assert!(!is_serialization_safe(&env, union_ty));
}

/// Union of tuple and list is rejected (both serialize as jsonb arrays).
#[test]
fn serialization_unsafe_union_tuple_and_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let tuple_ty = builder.tuple([int_ty, int_ty]);
    let list_ty = builder.list(int_ty);
    let union_ty = builder.union([tuple_ty, list_ty]);

    assert!(!is_serialization_safe(&env, union_ty));
}

/// Nested union with a collision is rejected.
///
/// The outer type is a tuple, but one of its fields contains a union with a
/// struct-vs-dict collision. The recursive walk catches it.
#[test]
fn serialization_unsafe_nested_union_collision() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let struct_ty = builder.r#struct([("a", int_ty)]);
    let dict_ty = builder.dict(str_ty, int_ty);
    let inner_union = builder.union([struct_ty, dict_ty]);

    let outer_tuple = builder.tuple([int_ty, inner_union]);

    assert!(!is_serialization_safe(&env, outer_tuple));
}

/// Deeply nested opaque in a union is rejected.
///
/// A struct contains a field whose type is a union with an opaque. The recursive
/// walk through the struct fields finds the problematic union.
#[test]
fn serialization_unsafe_opaque_in_nested_union() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let str_ty = builder.string();
    let uuid_ty = builder.opaque("Uuid", str_ty);
    let inner_union = builder.union([uuid_ty, str_ty]);

    let outer_struct = builder.r#struct([("id", inner_union), ("name", str_ty)]);

    assert!(!is_serialization_safe(&env, outer_struct));
}

/// Union of two structs is safe (both are jsonb objects, but with potentially
/// different key sets that the interpreter can use for disambiguation).
#[test]
fn serialization_safe_union_two_structs() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let struct_a = builder.r#struct([("a", int_ty)]);
    let struct_b = builder.r#struct([("b", int_ty)]);
    let union_ty = builder.union([struct_a, struct_b]);

    assert!(is_serialization_safe(&env, union_ty));
}

/// Union of two dicts is safe (both are jsonb objects of the same structural kind).
#[test]
fn serialization_safe_union_two_dicts() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let builder = TypeBuilder::synthetic(&env);

    let int_ty = builder.integer();
    let str_ty = builder.string();
    let dict_a = builder.dict(str_ty, int_ty);
    let dict_b = builder.dict(str_ty, str_ty);
    let union_ty = builder.union([dict_a, dict_b]);

    assert!(is_serialization_safe(&env, union_ty));
}

// =============================================================================
// Serialization safety: snapshot (integration) tests
// =============================================================================

/// Assignment to a serialization-unsafe type gets no cost, and downstream dependents
/// are also rejected.
///
/// `ambig` has type `Uuid | String` (opaque in union: not serialization-safe).
/// The load from the env field gets no cost because the result can't be round-tripped
/// through jsonb. `derived`, which uses `ambig` as an operand, also gets no cost
/// because `ambig` is not dispatchable. Meanwhile `safe` (type `Int`) gets costs
/// throughout as a control.
#[test]
fn serialization_unsafe_statement_no_cost() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([Union [Opaque "Uuid"; String], String], Int),
             vertex: [Opaque sym::path::Entity; ?],
             ambig: [Union [Opaque "Uuid"; String], String],
             safe: Int,
             derived: [Union [Opaque "Uuid"; String], String],
             result: Bool;
        @proj env_0 = env.0: [Union [Opaque "Uuid"; String], String],
              env_1 = env.1: Int;

        bb0() {
            ambig = load env_0;
            safe = load env_1;
            derived = load ambig;
            result = bin.> safe 42;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "serialization_unsafe_statement_no_cost",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}

/// Serialization-unsafe value flowing through a block param rejects downstream uses.
///
/// `ambig` (type `Uuid | String`) is loaded in bb0 and passed as a block param to bb1.
/// The block param inherits the rejection via `transfer_edge`: the operand is not
/// dispatchable AND the param's type is not serialization-safe. In bb1, `use_ambig`
/// (which loads from the rejected param) gets no cost. The parallel `safe` path
/// flows through with costs as a control.
#[test]
fn serialization_unsafe_edge_propagates() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: ([Union [Opaque "Uuid"; String], String], Int),
             vertex: [Opaque sym::path::Entity; ?],
             ambig: [Union [Opaque "Uuid"; String], String],
             safe: Int,
             use_ambig: [Union [Opaque "Uuid"; String], String],
             use_safe: Bool;
        @proj env_0 = env.0: [Union [Opaque "Uuid"; String], String],
              env_1 = env.1: Int;

        bb0() {
            ambig = load env_0;
            safe = load env_1;
            goto bb1(ambig, safe);
        },
        bb1(ambig, safe) {
            use_ambig = load ambig;
            use_safe = bin.> safe 42;
            return use_safe;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut placement = PostgresStatementPlacement::new_in(Global);
    let (body, statement_costs, traversal_costs) =
        run_placement(&mut context, &mut placement, body);

    assert_placement(
        "serialization_unsafe_edge_propagates",
        "postgres",
        &body,
        &context,
        &statement_costs,
        &traversal_costs,
    );
}
