//! Integration tests for [`ExecutionAnalysis`].
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;
use core::fmt::Write as _;
use std::path::PathBuf;

use hashql_core::{
    graph::DirectedGraph as _,
    heap::{Heap, Scratch},
    module::{ModuleRegistry, Universe},
    symbol::sym,
    r#type::{TypeId, environment::Environment},
    value::Primitive,
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::{ExecutionAnalysisResidual, IslandGraph};
use crate::{
    body::{Body, basic_block::BasicBlockVec, constant::Constant, operand::Operand},
    builder::body,
    context::MirContext,
    def::{DefId, DefIdSlice},
    intern::Interner,
    pass::{
        GlobalAnalysisPass as _,
        analysis::size_estimation::SizeEstimationAnalysis,
        execution::{ExecutionAnalysis, target::TargetId},
    },
};

/// Looks up a type from the stdlib module registry by path segments.
fn lookup_stdlib_type<'heap>(heap: &'heap Heap, env: &Environment<'heap>, path: &[&str]) -> TypeId {
    let registry = ModuleRegistry::new(env);
    let item = registry
        .lookup(path.iter().map(|s| heap.intern_symbol(s)), Universe::Type)
        .unwrap_or_else(|| panic!("type {path:?} should exist in stdlib"));

    #[expect(clippy::wildcard_enum_match_arm)]
    match item.kind {
        hashql_core::module::item::ItemKind::Type(typedef) => typedef.id,
        other => panic!("expected type, got {other:?}"),
    }
}

/// Builds a MIR filter body that compares `vertex.id.entity_id.entity_uuid` against a constant
/// `EntityUuid(Uuid("e2851dbb-..."))`, using real stdlib types.
///
/// Replicates the post-inline MIR shape:
/// ```text
/// %3 = opaque(Uuid, "e2851dbb-...")
/// %4 = opaque(EntityUuid, %3)
/// %2 = %1.id.entity_id.entity_uuid == %4
/// ```
pub(super) fn make_entity_uuid_eq_body<'heap>(
    heap: &'heap Heap,
    interner: &Interner<'heap>,
    env: &Environment<'heap>,
) -> Body<'heap> {
    let entity_type_id = lookup_stdlib_type(
        heap,
        env,
        &["graph", "types", "knowledge", "entity", "Entity"],
    );
    let entity_uuid_type_id = lookup_stdlib_type(
        heap,
        env,
        &["graph", "types", "knowledge", "entity", "EntityUuid"],
    );
    let uuid_type_id = lookup_stdlib_type(heap, env, &["core", "uuid", "Uuid"]);

    let opaque_symbol = |ty| {
        env.r#type(ty)
            .kind
            .opaque()
            .expect("type should be opaque")
            .name
    };

    let entity_uuid_type_symbol = opaque_symbol(entity_uuid_type_id);
    let uuid_type_symbol = opaque_symbol(uuid_type_id);

    let const_uuid = Operand::Constant(Constant::Primitive(Primitive::String(
        hashql_core::value::String::new(
            env.heap
                .intern_symbol("e2851dbb-7376-4959-9bca-f72cafc4448f"),
        ),
    )));

    body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (),
             vertex: (|_types: &_| entity_type_id),
             result: Bool,
             uuid_val: (|_types: &_| uuid_type_id),
             entity_uuid_val: (|_types: &_| entity_uuid_type_id);
        @proj vertex_id = vertex.id: ?, entity_id = vertex_id.entity_id: ?, vertex_uuid = entity_id.entity_uuid: (|_types: &_| entity_uuid_type_id);

        bb0() {
            uuid_val = opaque uuid_type_symbol, const_uuid;
            entity_uuid_val = opaque entity_uuid_type_symbol, uuid_val;
            result = bin.== vertex_uuid entity_uuid_val;
            return result;
        }
    })
}

/// Formats the per-block target assignment and island structure for snapshot comparison.
#[track_caller]
fn assert_execution<'heap>(
    name: &'static str,
    body: &Body<'heap>,
    context: &MirContext<'_, 'heap>,
    assignment: &BasicBlockVec<TargetId, &'heap Heap>,
    islands: &IslandGraph<&'heap Heap>,
) {
    use hashql_core::{
        pretty::Formatter,
        r#type::{TypeFormatter, TypeFormatterOptions},
    };

    use crate::pretty::{TextFormatAnnotations, TextFormatOptions};

    struct NoAnnotations;
    impl TextFormatAnnotations for NoAnnotations {}

    let formatter = Formatter::new(context.heap);
    let type_formatter = TypeFormatter::new(&formatter, context.env, TypeFormatterOptions::terse());

    let mut text_format = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: type_formatter,
        annotations: NoAnnotations,
    }
    .build();

    text_format.format_body(body).expect("formatting failed");

    let mut output = String::from_utf8_lossy(&text_format.writer).into_owned();

    writeln!(output).expect("infallible");
    writeln!(output, "---").expect("infallible");
    writeln!(output).expect("infallible");
    writeln!(output, "Assignment:").expect("infallible");
    for (block, target) in assignment.iter_enumerated() {
        writeln!(output, "  {block}: {target}").expect("infallible");
    }

    writeln!(output).expect("infallible");
    writeln!(output, "Islands:").expect("infallible");

    #[expect(clippy::use_debug)]
    for (island_id, island) in islands.iter_nodes() {
        let blocks: Vec<_> = island.members().collect();

        writeln!(
            output,
            "  {island_id}: target={}, blocks={blocks:?}",
            island.target()
        )
        .expect("infallible");
    }

    #[expect(clippy::use_debug)]
    for edge in islands.iter_edges() {
        writeln!(
            output,
            "  bb{} -> bb{}: {:?}",
            edge.source(),
            edge.target(),
            edge.data
        )
        .expect("infallible");
    }

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join("tests/ui/pass/execution"));
    settings.set_prepend_module_to_snapshot(false);

    let _guard = settings.bind_to_scope();
    assert_snapshot!(name, output);
}

/// Runs `SizeEstimationAnalysis`, then `ExecutionAnalysis`.
#[track_caller]
fn run_execution<'heap>(
    context: &mut MirContext<'_, 'heap>,
    body: &mut Body<'heap>,
) -> (
    BasicBlockVec<TargetId, &'heap Heap>,
    IslandGraph<&'heap Heap>,
) {
    let mut size_analysis = SizeEstimationAnalysis::new_in(Global);
    size_analysis.run(context, DefIdSlice::from_raw(core::slice::from_ref(body)));
    let footprints = size_analysis.finish();

    let mut scratch = Scratch::new();
    let analysis = ExecutionAnalysis {
        footprints: &footprints,
        scratch: &mut scratch,
    };

    let heap = context.heap;
    let ExecutionAnalysisResidual {
        assignment,
        islands,
    } = analysis.run_in(context, body, heap);

    assert!(
        context.diagnostics.is_empty(),
        "execution analysis produced diagnostics: {:?}",
        context.diagnostics,
    );

    (assignment, islands)
}

/// Closures and function calls force the interpreter.
///
/// Postgres rejects both `Closure` aggregates and `Apply`, and the environment type
/// contains a closure which excludes `env` from the Postgres dispatchable set.
/// The only viable target for every statement is the interpreter.
#[test]
fn closure_forces_interpreter() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(42);

    let mut body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (Int, [fn(Int) -> Int]), vertex: [Opaque sym::path::Entity; ?],
             env_int: Int, env_fn: [fn(Int) -> Int], capture: (Int, [fn(Int) -> Int]), func: [fn(Int) -> Int], result: Int;
        @proj env_0 = env.0: Int, env_1 = env.1: [fn(Int) -> Int];

        bb0() {
            env_int = load env_0;
            env_fn = load env_1;
            capture = tuple env_int, env_fn;
            func = closure callee_id capture;
            result = apply func, 5;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let (assignment, islands) = run_execution(&mut context, &mut body);

    assert_execution(
        "closure_forces_interpreter",
        &body,
        &context,
        &assignment,
        &islands,
    );
}

/// Mixing a Postgres projection with `Apply` splits the block across targets.
///
/// The entity projection `metadata.archived` is cheaper on Postgres while the closure
/// creation and function call can only run on the interpreter. The splitting pass
/// separates these into distinct blocks assigned to different targets.
#[test]
fn projection_and_apply_splits() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(42);

    let mut body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?],
             archived: Bool, env_int: Int, capture: (Int), func: [fn(Bool) -> Int], result: Int;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool,
              env_0 = env.0: Int;

        bb0() {
            archived = load archived_proj;
            env_int = load env_0;
            capture = tuple env_int;
            func = closure callee_id capture;
            result = apply func, archived;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let (assignment, islands) = run_execution(&mut context, &mut body);

    assert_execution(
        "projection_and_apply_splits",
        &body,
        &context,
        &assignment,
        &islands,
    );
}

/// Three targets: Postgres projection, Embedding projection, and `Apply` on interpreter.
///
/// `metadata.archived` maps to Postgres, `encodings.vectors` maps to Embedding, and the
/// closure/function call can only run on the interpreter. The pipeline should produce
/// islands for each target.
#[test]
fn mixed_postgres_embedding_interpreter() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let callee_id = DefId::new(42);

    let mut body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
        decl env: (Int), vertex: [Opaque sym::path::Entity; ?],
             archived: Bool, vectors: ?,
             env_int: Int, capture: (Int), func: [fn(Bool) -> Int], result: Int;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool,
              encodings = vertex.encodings: ?, vectors_proj = encodings.vectors: ?,
              env_0 = env.0: Int;

        bb0() {
            archived = load archived_proj;
            vectors = load vectors_proj;
            env_int = load env_0;
            capture = tuple env_int;
            func = closure callee_id capture;
            result = apply func, archived;
            return result;
        }
    });

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let (assignment, islands) = run_execution(&mut context, &mut body);

    assert_execution(
        "mixed_postgres_embedding_interpreter",
        &body,
        &context,
        &assignment,
        &islands,
    );
}

/// `EntityUuid` equality with real stdlib types through the full execution pipeline.
///
/// Reproduces the placement failure from entity-uuid-equality compiletest.
#[test]
fn entity_uuid_equality() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let mut body = make_entity_uuid_eq_body(&heap, &interner, &env);

    let mut context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let (assignment, islands) = run_execution(&mut context, &mut body);

    assert_execution(
        "entity_uuid_equality",
        &body,
        &context,
        &assignment,
        &islands,
    );
}
