//! MIR builder snapshot tests for the Postgres filter compiler.
//!
//! These tests construct MIR bodies programmatically via the `body!` macro, run the full
//! execution analysis pipeline to compute island boundaries, then compile the Postgres islands
//! to SQL. This exercises MIR constructs that exist in the compiler but cannot yet be produced
//! from J-Expr — either because the HIR specialization phase doesn't support the intrinsic
//! (e.g. arithmetic, unary NOT) or because the type system can't resolve the access yet
//! (e.g. property field subscripts on generic entity types).
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;
use std::path::PathBuf;

use hash_graph_postgres_store::store::postgres::query::{Expression, Transpile as _};
use hashql_core::{
    heap::{Heap, Scratch},
    id::Id as _,
    symbol::sym,
    r#type::{TypeBuilder, TypeId, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::node::operation::InputOp;
use hashql_mir::{
    body::{Body, Source, basic_block::BasicBlockId, local::Local, terminator::GraphReadBody},
    builder::{BodyBuilder, body},
    context::MirContext,
    def::{DefId, DefIdVec},
    intern::Interner,
    pass::{
        GlobalAnalysisPass as _,
        analysis::SizeEstimationAnalysis,
        execution::{ExecutionAnalysis, ExecutionAnalysisResidual, IslandKind, TargetId},
    },
};
use insta::{Settings, assert_snapshot};

use crate::{
    context::EvalContext,
    postgres::{DatabaseContext, PostgresCompiler, filter::GraphReadFilterCompiler},
};

/// Runs the full execution analysis pipeline on a single `body!`-constructed filter body
/// and returns everything needed for compilation.
struct Fixture<'heap> {
    env: Environment<'heap>,
    bodies: DefIdVec<Body<'heap>, &'heap Heap>,
    execution: DefIdVec<Option<ExecutionAnalysisResidual<&'heap Heap>>, &'heap Heap>,
}

impl<'heap> Fixture<'heap> {
    fn new(heap: &'heap Heap, env: Environment<'heap>, body: Body<'heap>) -> Self {
        assert!(
            matches!(body.source, Source::GraphReadFilter(_)),
            "these tests require GraphReadFilter bodies",
        );

        let interner = Interner::new(heap);
        let mut scratch = Scratch::new();

        let mut bodies = DefIdVec::new_in(heap);
        bodies.push(body);

        let mut mir_context = MirContext {
            heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        };

        let mut size_analysis = SizeEstimationAnalysis::new_in(&scratch);
        size_analysis.run(&mut mir_context, &bodies);
        let footprints = size_analysis.finish();

        let analysis = ExecutionAnalysis {
            footprints: &footprints,
            scratch: &mut scratch,
        };
        let execution = analysis.run_all_in(&mut mir_context, &mut bodies, heap);

        assert!(
            mir_context.diagnostics.is_empty(),
            "execution analysis produced diagnostics: this likely means the body is malformed",
        );

        Self {
            env,
            bodies,
            execution,
        }
    }

    fn def(&self) -> DefId {
        self.bodies.iter().next().expect("fixture has one body").id
    }
}

struct FilterIslandReport {
    entry_block: BasicBlockId,
    target: TargetId,
    sql: String,
}

struct FilterReport {
    islands: Vec<FilterIslandReport>,
}

impl core::fmt::Display for FilterReport {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        for (i, island) in self.islands.iter().enumerate() {
            if i > 0 {
                writeln!(f)?;
            }
            let label = format!(
                " Island (entry: bb{}, target: {}) ",
                island.entry_block.as_u32(),
                island.target,
            );
            writeln!(f, "{label:=^80}\n")?;
            write!(f, "{}", island.sql)?;
        }
        Ok(())
    }
}

fn compile_filter_islands<'heap>(fixture: &Fixture<'heap>, heap: &'heap Heap) -> FilterReport {
    let mut scratch = Scratch::new();
    let def = fixture.def();

    let context = EvalContext::new_in(
        &fixture.env,
        &fixture.bodies,
        &fixture.execution,
        heap,
        &mut scratch,
    );

    let body = &fixture.bodies[def];
    let residual = fixture.execution[def]
        .as_ref()
        .expect("residual should exist");

    // Collect Postgres exec islands sorted by entry block for stable output.
    let mut postgres_islands: Vec<_> = residual
        .islands
        .find(TargetId::Postgres)
        .filter(|(_, node)| matches!(node.kind(), IslandKind::Exec(_)))
        .map(|(island_id, node)| {
            let entry = find_entry_block(body, node);
            (island_id, entry)
        })
        .collect();
    postgres_islands.sort_by_key(|&(_, entry)| entry.as_u32());

    let mut island_reports = Vec::new();

    for (island_id, entry_block) in postgres_islands {
        let island = &residual.islands[island_id];

        let mut db = DatabaseContext::new_in(heap);
        let mut compiler = GraphReadFilterCompiler::new(&context, body, Local::ENV, Global);

        let expression = compiler.compile_body(&mut db, island);
        let diagnostics = compiler.into_diagnostics();

        assert!(
            diagnostics.is_empty(),
            "unexpected diagnostics from filter compilation",
        );

        let sql = expression.transpile_to_string();

        island_reports.push(FilterIslandReport {
            entry_block,
            target: island.target(),
            sql,
        });
    }

    FilterReport {
        islands: island_reports,
    }
}

fn find_entry_block(
    body: &Body<'_>,
    island: &hashql_mir::pass::execution::IslandNode,
) -> BasicBlockId {
    use hashql_core::graph::Predecessors as _;

    for block in island.members() {
        if body
            .basic_blocks
            .predecessors(block)
            .all(|pred| !island.contains(pred))
        {
            return block;
        }
    }
    unreachable!("The postgres island always has an entry block (BasicBlockId::START)")
}
struct QueryReport {
    sql: String,
    parameters: String,
}

impl core::fmt::Display for QueryReport {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        writeln!(f, "{:=^80}\n", " SQL ")?;
        write!(f, "{}", self.sql)?;

        if !self.parameters.is_empty() {
            writeln!(f, "\n{:=^80}\n", " Parameters ")?;
            write!(f, "{}", self.parameters)?;
        }
        Ok(())
    }
}

fn compile_full_query<'heap>(fixture: &Fixture<'heap>, heap: &'heap Heap) -> QueryReport {
    compile_full_query_with_mask(fixture, heap, None)
}

fn compile_full_query_with_mask<'heap>(
    fixture: &Fixture<'heap>,
    heap: &'heap Heap,
    property_mask: Option<hash_graph_postgres_store::store::postgres::query::Expression>,
) -> QueryReport {
    let mut scratch = Scratch::new();
    let def = fixture.def();

    let mut context = EvalContext::new_in(
        &fixture.env,
        &fixture.bodies,
        &fixture.execution,
        heap,
        &mut scratch,
    );

    let mut filters = hashql_core::heap::Vec::new_in(heap);
    filters.push(GraphReadBody::Filter(def, Local::ENV));

    let read = hashql_mir::body::terminator::GraphRead {
        head: hashql_mir::body::terminator::GraphReadHead::Entity {
            axis: hashql_mir::body::operand::Operand::Place(hashql_mir::body::place::Place::local(
                Local::ENV,
            )),
        },
        body: filters,
        tail: hashql_mir::body::terminator::GraphReadTail::Collect,
        target: BasicBlockId::START,
    };

    let prepared_query = {
        let mut compiler =
            PostgresCompiler::new_in(&mut context, &mut scratch).with_property_mask(property_mask);
        compiler.compile(&read)
    };

    assert!(
        context.diagnostics.is_empty(),
        "unexpected diagnostics from full compilation",
    );

    let sql = prepared_query.transpile().to_string();
    let parameters = format!("{}", prepared_query.parameters);

    QueryReport { sql, parameters }
}

fn snapshot_settings() -> Settings {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/postgres/filter"));
    settings.set_prepend_module_to_snapshot(false);
    settings
}

/// Diamond CFG entirely within one Postgres island. Both branches converge at bb3.
/// Verifies locals snapshot/rollback across the diamond and CASE generation.
#[test]
fn diamond_cfg_merge() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             cond: Bool, result: Bool;

        bb0() {
            cond = input.load! "flag";
            if cond then bb1() else bb2();
        },
        bb1() {
            goto bb3(true);
        },
        bb2() {
            goto bb3(false);
        },
        bb3(result) {
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("diamond_cfg_merge", report.to_string());
}

/// Multi-way switch with 4 value targets + otherwise.
#[test]
fn switch_int_many_branches() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             selector: Int, result: Bool;

        bb0() {
            selector = input.load! "sel";
            switch selector [0 => bb1(), 1 => bb2(), 2 => bb3(), 3 => bb4(), _ => bb5()];
        },
        bb1() { return true; },
        bb2() { return false; },
        bb3() { return true; },
        bb4() { return false; },
        bb5() { return true; }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("switch_int_many_branches", report.to_string());
}

/// Linear goto chain: bb0 → bb1 → bb2 → return, all within Postgres island,
/// with block parameters passed at each goto.
#[test]
fn straight_line_goto_chain() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             a: Bool, b: Bool, result: Bool;

        bb0() {
            a = input.load! "val";
            goto bb1(a);
        },
        bb1(b) {
            goto bb2(b);
        },
        bb2(result) {
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("straight_line_goto_chain", report.to_string());
}

/// Goto crossing an island boundary. Entity path loads in bb0 make Interpreter placement
/// expensive enough that the solver prefers Postgres + paying the P→I switch cost. The
/// apply in bb1 forces Interpreter, creating the island exit.
#[test]
fn island_exit_goto() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             rec: ?, temporal: ?, eid: ?, props: ?, archived: ?,
             func: [fn() -> ?], result: ?;
        @proj v_meta = vertex.metadata: ?,
              v_rec = v_meta.record_id: ?,
              v_eid = v_rec.entity_id: ?,
              v_temporal = v_meta.temporal_versioning: ?,
              v_archived = v_meta.archived: ?,
              v_props = vertex.properties: ?;

        bb0() {
            rec = load v_rec;
            temporal = load v_temporal;
            eid = load v_eid;
            props = load v_props;
            archived = load v_archived;
            goto bb1(rec);
        },
        bb1(result) {
            func = load callee_id;
            result = apply func;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("island_exit_goto", report.to_string());
}

/// Island exit captures both block parameters AND remaining live-out locals.
/// bb0 defines `uuid` (entity path → Postgres) and `extra` (input, live-out);
/// bb1 receives `uuid` as a block param and has an apply to force Interpreter.
#[test]
fn island_exit_with_live_out() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             rec: ?, temporal: ?, props: ?, extra: ?,
             func: [fn() -> ?], result: ?;
        @proj v_meta = vertex.metadata: ?,
              v_rec = v_meta.record_id: ?,
              v_temporal = v_meta.temporal_versioning: ?,
              v_props = vertex.properties: ?;

        bb0() {
            rec = load v_rec;
            temporal = load v_temporal;
            props = load v_props;
            extra = input.load! "b";
            goto bb1(rec);
        },
        bb1(result) {
            func = load callee_id;
            result = apply func;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("island_exit_with_live_out", report.to_string());
}

/// `SwitchInt` where one branch returns (stays in Postgres) and the other exits to the
/// interpreter — mixed continuation types within a single CASE tree.
#[test]
fn island_exit_switch_int() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    // Entity path loads anchor bb0 to Postgres. bb1 returns (stays in Postgres);
    // bb2 does a closure apply (forces Interpreter).
    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             rec: ?, temporal: ?, props: ?, cond: Bool,
             func: [fn() -> ?], result: ?;
        @proj v_meta = vertex.metadata: ?,
              v_rec = v_meta.record_id: ?,
              v_temporal = v_meta.temporal_versioning: ?,
              v_props = vertex.properties: ?;

        bb0() {
            rec = load v_rec;
            temporal = load v_temporal;
            props = load v_props;
            cond = input.load! "flag";
            if cond then bb1() else bb2();
        },
        bb1() {
            result = load true;
            return result;
        },
        bb2() {
            func = load callee_id;
            result = apply func;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("island_exit_switch_int", report.to_string());
}

/// Goto crosses island boundary with no target arguments AND no live-out locals.
/// Tests the edge case of empty ARRAY[] literals with type casts.
#[test]
fn island_exit_empty_arrays() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    // Entity path loads anchor bb0 to Postgres, but none of its locals are used by bb1.
    // bb1 starts fresh with its own closure apply (Interpreter).
    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             rec: ?, temporal: ?, props: ?,
             func: [fn() -> ?], result: ?;
        @proj v_meta = vertex.metadata: ?,
              v_rec = v_meta.record_id: ?,
              v_temporal = v_meta.temporal_versioning: ?,
              v_props = vertex.properties: ?;

        bb0() {
            rec = load v_rec;
            temporal = load v_temporal;
            props = load v_props;
            goto bb1();
        },
        bb1() {
            func = load callee_id;
            result = apply func;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("island_exit_empty_arrays", report.to_string());
}

/// When the solver creates only a Postgres Data island (no exec island), the data island
/// contributes entity columns to the SELECT list but does NOT produce a continuation LATERAL.
#[test]
fn data_island_provides_without_lateral() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    // Light entity path accesses — solver puts everything on Interpreter, creating only a
    // Postgres Data island for the entity columns. No Postgres exec island exists.
    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             uuid: ?, func: [fn() -> ?], result: ?;
        @proj v_uuid = vertex.entity_uuid: ?;

        bb0() {
            uuid = load v_uuid;
            func = load callee_id;
            result = apply func;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);

    // No Postgres exec islands should exist — only a Data island.
    let filter_report = compile_filter_islands(&fixture, &heap);
    assert!(
        filter_report.islands.is_empty(),
        "expected no Postgres exec islands, but found {}",
        filter_report.islands.len(),
    );

    // The full query should still include entity columns from the Data island's provides.
    let query_report = compile_full_query(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!(
        "data_island_provides_without_lateral",
        query_report.to_string()
    );
}

/// A Postgres island that provides traversal paths to a downstream interpreter island.
/// The SELECT list should include provided paths with correct joins, and the continuation
/// LATERAL should appear.
#[test]
fn provides_drives_select_and_joins() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    // bb0 accesses entity paths (Postgres-origin), then bb1 uses a closure (Interpreter).
    // The Postgres island should provide the accessed paths to the Interpreter island.
    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             uuid: ?, archived: ?, func: [fn() -> ?], result: ?;
        @proj v_uuid = vertex.entity_uuid: ?,
              v_metadata = vertex.metadata: ?,
              v_archived = v_metadata.archived: ?;

        bb0() {
            uuid = load v_uuid;
            archived = load v_archived;
            goto bb1();
        },
        bb1() {
            func = load callee_id;
            result = apply func;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_full_query(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("provides_drives_select_and_joins", report.to_string());
}

/// Property field access: `vertex.properties.<field>` → `json_extract_path(properties,
/// $key::text)`. Triggers `entity_editions` JOIN for the properties column.
#[test]
fn property_field_equality() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             field_val: ?, input_val: ?, result: Bool;
        @proj v_props = vertex.properties: ?,
              v_name = v_props.name: ?;

        bb0() {
            field_val = load v_name;
            input_val = input.load! "expected";
            result = bin.== field_val input_val;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("property_field_equality", report.to_string());
}

/// Nested property access: `vertex.properties.<field>.<subfield>` →
/// `json_extract_path(properties, $key1::text, $key2::text)`.
#[test]
fn nested_property_access() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             val: ?, input_val: ?, result: Bool;
        @proj v_props = vertex.properties: ?,
              v_address = v_props.address: ?,
              v_city = v_address.city: ?;

        bb0() {
            val = load v_city;
            input_val = input.load! "expected_city";
            result = bin.== val input_val;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("nested_property_access", report.to_string());
}

/// Link data field access: `vertex.link_data.left_entity_id.entity_uuid` →
/// LEFT OUTER JOIN on `entity_has_left_entity`, correct column reference.
#[test]
fn left_entity_filter() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             left_uuid: ?, input_id: ?, result: Bool;
        @proj v_link = vertex.link_data: ?,
              v_left = v_link.left_entity_id: ?,
              v_left_uuid = v_left.entity_uuid: ?;

        bb0() {
            left_uuid = load v_left_uuid;
            input_id = input.load! "id";
            result = bin.== left_uuid input_id;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("left_entity_filter", report.to_string());
}

/// Property mask wraps `properties` and `property_metadata` SELECT expressions with
/// `(col - mask)` but leaves other columns untouched.
#[test]
fn property_mask() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    // Properties access in bb0 (Postgres Data island) with an apply in bb1 (Interpreter)
    // ensures Properties and `PropertyMetadata` appear in the provides set.
    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             props: ?, prop_meta: ?, func: [fn() -> ?], result: ?;
        @proj v_props = vertex.properties: ?,
              v_meta = vertex.metadata: ?,
              v_prop_meta = v_meta.property_metadata: ?;

        bb0() {
            props = load v_props;
            prop_meta = load v_prop_meta;
            func = load callee_id;
            result = apply func;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);

    // Use a parameter placeholder as the mask expression.
    let mask = Expression::Parameter(99);

    let report = compile_full_query_with_mask(&fixture, &heap, Some(mask));

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("property_mask", report.to_string());
}

/// Tuple aggregate followed by `.0` numeric field projection →
/// `json_extract_path(base, (0)::text)`.
#[test]
fn field_index_projection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             tup: (Int, Int), result: Int;
        @proj first = tup.0: Int;

        bb0() {
            tup = tuple 10, 20;
            result = load first;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("field_index_projection", report.to_string());
}

/// Struct field access using `ProjectionKind::FieldByName(symbol)` →
/// `json_extract_path(base, ($symbol)::text)`.
#[test]
fn field_by_name_projection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             s: (x: Int, y: Int), result: Int;
        @proj x_field = s.x: Int;

        bb0() {
            s = struct x: 10, y: 20;
            result = load x_field;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("field_by_name_projection", report.to_string());
}

/// Dynamic index projection where the key comes from a local.
/// `ProjectionKind::Index(local)` → `json_extract_path(base, (local_expr)::text)`.
#[test]
fn dynamic_index_projection() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut builder = BodyBuilder::new(&interner);
    let types = TypeBuilder::synthetic(&env);

    let int_ty = types.integer();
    let unknown_ty = types.unknown();
    let entity_ty = types.opaque(sym::path::Entity, unknown_ty);
    let unit_ty = types.tuple([] as [TypeId; 0]);
    let list_ty = types.list(int_ty);

    let _env_local = builder.local("env", unit_ty);
    let _vertex = builder.local("vertex", entity_ty);
    let list = builder.local("list", list_ty);
    let idx = builder.local("idx", int_ty);
    let result = builder.local("result", int_ty);

    // list[idx] — Index projection
    let list_at_idx = builder.place(|p| p.from(list).index(idx.local, int_ty));

    let bb0 = builder.reserve_block([]);

    builder
        .build_block(bb0)
        .assign_place(list, |rv| {
            let elems = [rv.const_int(10), rv.const_int(20), rv.const_int(30)];
            rv.list(elems)
        })
        .assign_place(idx, |rv| {
            rv.input(InputOp::Load { required: true }, "index")
        })
        .assign_place(result, |rv| rv.load(list_at_idx))
        .ret(result);

    let mut body = builder.finish(2, int_ty);
    body.source = Source::GraphReadFilter(hashql_hir::node::HirId::PLACEHOLDER);
    body.id = DefId::new(0);

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("dynamic_index_projection", report.to_string());
}

/// `UnOp::Neg` → `UnaryOperator::Negate` in SQL.
#[test]
fn unary_neg() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             x: Int, result: Int;

        bb0() {
            x = input.load! "val";
            result = un.neg x;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("unary_neg", report.to_string());
}

/// `UnOp::Not` → `UnaryOperator::Not` in SQL.
#[test]
fn unary_not() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             x: Bool, result: Bool;

        bb0() {
            x = input.load! "val";
            result = un.! x;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("unary_not", report.to_string());
}

/// `BinOp::Sub` → `BinaryOperator::Subtract` with `::numeric` casts on both operands.
#[test]
fn binary_sub_numeric_cast() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             x: Int, y: Int, result: Int;

        bb0() {
            x = input.load! "a";
            y = input.load! "b";
            result = bin.- x y;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("binary_sub_numeric_cast", report.to_string());
}

/// `UnOp::BitNot` → `UnaryOperator::BitwiseNot` in SQL.
#[test]
fn unary_bitnot() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             x: Int, result: Int;

        bb0() {
            x = input.load! "val";
            result = un.~ x;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("unary_bitnot", report.to_string());
}

/// Temporal leaf path: `vertex.metadata.temporal_versioning.decision_time` decomposes
/// the `tstzrange` column into a structured interval with `lower`/`upper`/`lower_inc`/
/// `upper_inc`/`lower_inf` and epoch-millisecond extraction.
#[test]
fn temporal_decision_time_interval() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(99);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             decision: ?, func: [fn() -> ?], result: ?;
        @proj v_meta = vertex.metadata: ?,
              v_temporal = v_meta.temporal_versioning: ?,
              v_decision = v_temporal.decision_time: ?;

        bb0() {
            decision = load v_decision;
            goto bb1();
        },
        bb1() {
            func = load callee_id;
            result = apply func;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_full_query(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("temporal_decision_time_interval", report.to_string());
}

/// `BinOp::BitAnd` → `BinaryOperator::BitwiseAnd` with `::bigint` casts on both operands.
#[test]
fn binary_bitand_bigint_cast() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             x: Int, y: Int, result: Int;

        bb0() {
            x = input.load! "a";
            y = input.load! "b";
            result = bin.& x y;
            return result;
        }
    });

    let fixture = Fixture::new(&heap, env, body);
    let report = compile_filter_islands(&fixture, &heap);

    let settings = snapshot_settings();
    let _guard = settings.bind_to_scope();
    assert_snapshot!("binary_bitand_bigint_cast", report.to_string());
}
