//! Integration tests for [`ExecutionAnalysis`].
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;
use core::fmt::Write as _;
use std::path::PathBuf;

use hashql_core::{
    heap::{Heap, Scratch},
    symbol::sym,
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::island::Island;
use crate::{
    body::{Body, basic_block::BasicBlockVec},
    builder::body,
    context::MirContext,
    def::{DefId, DefIdSlice},
    intern::Interner,
    pass::{
        Changed, GlobalAnalysisPass as _, TransformPass as _,
        analysis::size_estimation::SizeEstimationAnalysis,
        execution::{ExecutionAnalysis, island::IslandVec, target::TargetId},
        transform::TraversalExtraction,
    },
};

/// Formats the per-block target assignment and island structure for snapshot comparison.
#[track_caller]
fn assert_execution<'heap>(
    name: &'static str,
    assignment: &BasicBlockVec<TargetId, &'heap Heap>,
    islands: &IslandVec<Island, &'heap Heap>,
) {
    let mut output = String::new();

    writeln!(output, "Assignment:").expect("infallible");
    for (block, target) in assignment.iter_enumerated() {
        writeln!(output, "  {block}: {target}").expect("infallible");
    }

    writeln!(output).expect("infallible");
    writeln!(output, "Islands:").expect("infallible");

    #[expect(clippy::use_debug)]
    for (island_id, island) in islands.iter_enumerated() {
        let blocks: Vec<_> = island.iter().collect();

        writeln!(
            output,
            "  {island_id}: target={}, blocks={blocks:?}",
            island.target()
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

/// Runs `TraversalExtraction` and `SizeEstimationAnalysis`, then `ExecutionAnalysis`.
#[track_caller]
fn run_execution<'heap>(
    context: &mut MirContext<'_, 'heap>,
    body: &mut Body<'heap>,
) -> (
    BasicBlockVec<TargetId, &'heap Heap>,
    IslandVec<Island, &'heap Heap>,
) {
    let mut extraction = TraversalExtraction::new_in(Global);
    let _: Changed = extraction.run(context, body);
    let traversals = extraction
        .take_traversals()
        .expect("expected GraphReadFilter body");

    let traversals = [Some(traversals)];
    let traversals_slice = DefIdSlice::from_raw(&traversals);

    let mut size_analysis = SizeEstimationAnalysis::new_in(Global);
    size_analysis.run(context, DefIdSlice::from_raw(core::slice::from_ref(body)));
    let footprints = size_analysis.finish();

    let mut scratch = Scratch::new();
    let analysis = ExecutionAnalysis {
        traversals: traversals_slice,
        footprints: &footprints,
        scratch: &mut scratch,
    };

    analysis.run(context, body)
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
             capture: (Int, [fn(Int) -> Int]), func: [fn(Int) -> Int], result: Int;

        bb0() {
            capture = load env;
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

    assert_execution("closure_forces_interpreter", &assignment, &islands);
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
             archived: Bool, capture: (Int), func: [fn(Bool) -> Int], result: Int;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool;

        bb0() {
            archived = load archived_proj;
            capture = load env;
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

    assert_execution("projection_and_apply_splits", &assignment, &islands);
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
             capture: (Int), func: [fn(Bool) -> Int], result: Int;
        @proj metadata = vertex.metadata: ?, archived_proj = metadata.archived: Bool,
              encodings = vertex.encodings: ?, vectors_proj = encodings.vectors: ?;

        bb0() {
            archived = load archived_proj;
            vectors = load vectors_proj;
            capture = load env;
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
        &assignment,
        &islands,
    );
}
