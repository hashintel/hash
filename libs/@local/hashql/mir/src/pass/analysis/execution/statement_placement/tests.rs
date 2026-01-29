//! Shared test harness for statement placement analysis.
#![expect(clippy::min_ident_chars)]

use alloc::alloc::Global;
use core::{alloc::Allocator, fmt::Display};
use std::{io::Write as _, path::PathBuf};

use hashql_core::{
    heap::Heap,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use insta::{Settings, assert_snapshot};

use super::StatementPlacement;
use crate::{
    body::{Body, local::Local, location::Location, statement::Statement},
    builder::body,
    context::MirContext,
    intern::Interner,
    pass::{
        Changed, TransformPass as _,
        analysis::execution::{
            cost::{StatementCostVec, TraversalCostVec},
            statement_placement::{EmbeddingStatementPlacement, PostgresStatementPlacement},
        },
        transform::{TraversalExtraction, Traversals},
    },
    pretty::{TextFormatAnnotations, TextFormatOptions},
};

/// Annotation provider that displays statement costs as trailing comments.
struct CostAnnotations<'costs, A: Allocator> {
    costs: &'costs StatementCostVec<A>,
}

impl<A: Allocator> TextFormatAnnotations for CostAnnotations<'_, A> {
    type StatementAnnotation<'this, 'heap>
        = impl Display
    where
        Self: 'this;

    fn annotate_statement<'heap>(
        &self,
        location: Location,
        _statement: &Statement<'heap>,
    ) -> Option<Self::StatementAnnotation<'_, 'heap>> {
        let cost = self.costs.get(location)?;

        Some(core::fmt::from_fn(move |fmt| write!(fmt, "cost: {cost}")))
    }
}

/// Formats traversal costs as a summary section.
fn format_traversals<A: Allocator>(traversal_costs: &TraversalCostVec<A>) -> impl Display {
    core::fmt::from_fn(move |f| {
        writeln!(f, "Traversals:")?;
        for (local, cost) in traversal_costs {
            writeln!(f, "  {local}: {cost}")?;
        }
        Ok(())
    })
}

/// Runs statement placement analysis and asserts the result matches a snapshot.
#[track_caller]
pub(crate) fn assert_placement<'heap, A: Allocator>(
    name: &'static str,
    snapshot_subdir: &str,
    body: &Body<'heap>,
    context: &MirContext<'_, 'heap>,
    statement_costs: &StatementCostVec<A>,
    traversal_costs: &TraversalCostVec<A>,
) {
    let formatter = Formatter::new(context.heap);
    let type_formatter = TypeFormatter::new(&formatter, context.env, TypeFormatterOptions::terse());

    let annotations = CostAnnotations {
        costs: statement_costs,
    };

    let mut text_format = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: type_formatter,
        annotations,
    }
    .build();

    text_format.format_body(body).expect("formatting failed");

    write!(
        text_format.writer,
        "\n\n{:=^50}\n\n",
        format!(" Traversals ")
    )
    .expect("infallible");

    write!(text_format.writer, "{}", format_traversals(traversal_costs))
        .expect("formatting failed");

    // Snapshot configuration
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut settings = Settings::clone_current();
    settings.set_snapshot_path(dir.join(format!(
        "tests/ui/pass/execution/statement_placement/{snapshot_subdir}"
    )));
    settings.set_prepend_module_to_snapshot(false);

    let _guard = settings.bind_to_scope();

    let output = String::from_utf8_lossy(&text_format.writer);
    assert_snapshot!(name, output);
}

/// Helper to set up a test context and run placement analysis.
///
/// Returns the body, context components, and cost vectors for assertion.
#[track_caller]
pub(crate) fn run_placement<'heap>(
    context: &mut MirContext<'_, 'heap>,
    placement: &mut impl StatementPlacement<'heap, Global>,
    mut body: Body<'heap>,
) -> (
    Body<'heap>,
    StatementCostVec<&'heap Heap>,
    TraversalCostVec<&'heap Heap>,
) {
    // Run TraversalExtraction to produce Traversals
    let mut extraction = TraversalExtraction::new_in(Global);
    let _: Changed = extraction.run(context, &mut body);
    let traversals = extraction
        .take_traversals()
        .expect("expected GraphReadFilter body");

    // Run placement analysis
    let (traversal_costs, statement_costs) =
        placement.statement_placement(context, &body, &traversals, Global);

    (body, statement_costs, traversal_costs)
}

// =============================================================================
// Shared Tests
// =============================================================================

/// Non-`GraphReadFilter` sources return empty costs for Postgres and Embedding.
///
/// Tests that only `Source::GraphReadFilter` bodies produce placement costs.
/// Other sources (Closure, Thunk, Ctor, Intrinsic) should return empty cost vectors
/// for specialized backends, though Interpreter still assigns costs.
#[test]
fn non_graph_read_filter_returns_empty() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    // Use a closure source instead of GraphReadFilter
    let body = body!(interner, env; fn@0/0 -> Int {
        decl x: Int, y: Int, result: Int;

        bb0() {
            x = load 10;
            y = load 20;
            result = bin.+ x y;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = Traversals::with_capacity_in(Local::new(1), body.local_decls.len(), &heap);

    let mut postgres = PostgresStatementPlacement::default();
    let mut embedding = EmbeddingStatementPlacement::default();

    let (postgres_traversal, postgres_statement) =
        postgres.statement_placement(&context, &body, &traversals, &heap);
    let (embedding_traversal, embedding_statement) =
        embedding.statement_placement(&context, &body, &traversals, &heap);

    assert_eq!(postgres_traversal.iter().count(), 0);
    assert!(postgres_statement.is_empty());
    assert_eq!(embedding_traversal.iter().count(), 0);
    assert!(embedding_statement.is_empty());
}
