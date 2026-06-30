//! Shared test infrastructure for Postgres compiler tests.

use hashql_core::{
    heap::{Heap, Scratch},
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{
    body::{Body, Source},
    context::MirContext,
    def::{DefId, DefIdVec},
    intern::Interner,
    pass::{
        GlobalAnalysisPass as _,
        analysis::SizeEstimationAnalysis,
        execution::{ExecutionAnalysis, ExecutionAnalysisResidual},
    },
    pretty::TextFormatOptions,
};
use sqruff_lib::core::{config::FluffConfig, linter::core::Linter};
use sqruff_lib_core::dialects::init::DialectKind;

/// Compiles a single MIR filter body through execution analysis.
///
/// Provides the analyzed body, environment, and interner needed by
/// [`PostgresCompiler`](super::PostgresCompiler) and downstream test helpers.
pub(super) struct CompilationFixture<'heap> {
    pub env: Environment<'heap>,
    pub interner: crate::intern::Interner<'heap>,
    pub bodies: DefIdVec<Body<'heap>, &'heap Heap>,
    pub execution: DefIdVec<Option<ExecutionAnalysisResidual<&'heap Heap>>, &'heap Heap>,
}

impl<'heap> CompilationFixture<'heap> {
    pub(super) fn new(heap: &'heap Heap, env: Environment<'heap>, body: Body<'heap>) -> Self {
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
            interner: interner.into(),
            bodies,
            execution,
        }
    }

    pub(super) fn def(&self) -> DefId {
        self.bodies.iter().next().expect("fixture has one body").id
    }
}

/// Pretty-prints the MIR body from a compilation fixture.
pub(super) fn format_body<'heap>(fixture: &CompilationFixture<'heap>, heap: &'heap Heap) -> String {
    let formatter = Formatter::new(heap);
    let mut type_formatter =
        TypeFormatter::new(&formatter, &fixture.env, TypeFormatterOptions::terse());

    let mut text_format = TextFormatOptions {
        writer: Vec::<u8>::new(),
        indent: 4,
        sources: (),
        types: &mut type_formatter,
        annotations: (),
    }
    .build();

    let body = &fixture.bodies[fixture.def()];
    text_format.format_body(body).expect("formatting failed");

    String::from_utf8(text_format.writer).expect("valid UTF-8")
}

/// Lints a SQL string through sqruff with Postgres dialect.
pub(super) fn lint_sql(sql: &str) -> String {
    let mut linter_config = FluffConfig::default();
    linter_config
        .override_dialect(DialectKind::Postgres)
        .expect("dialect should be loaded");
    let linter = Linter::new(linter_config, None, None, false).expect("linter should be created");

    let linted = linter
        .lint_string(sql, None, true)
        .expect("should be valid SQL");

    linted.fix_string()
}
