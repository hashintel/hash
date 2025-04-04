use core::{error, iter};
use std::{
    fs::{self, File},
    io::Cursor,
    path::PathBuf,
    sync::Arc,
    thread,
};

use ariadne::Source;
use error_stack::{
    Report, ReportSink, ResultExt as _, TryReportIteratorExt as _, TryReportTupleExt,
};
use guppy::{
    PackageId,
    graph::{DependencyDirection, PackageGraph, cargo::BuildPlatform},
};
use hashql_ast::{heap::Heap, node::expr::Expr};
use hashql_core::span::{SpanId, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic, category::DiagnosticCategory, config::ReportConfig, span::DiagnosticSpan,
};
use hashql_syntax_jexpr::{Parser, span::Span};
use nextest_filtering::{
    BinaryQuery, CompiledExpr, EvalContext, Filterset, FiltersetKind, ParseContext, TestQuery,
};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};
use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};
use similar_asserts::SimpleDiff;

use crate::{
    FileAnnotations, Suite, TestCase, TestGroup, annotation::directive::RunMode, suite::suite,
};

#[derive(Debug, derive_more::Display)]
pub(crate) enum TrialError {
    #[display("unable to resolve diagnostic")]
    UnableToResolveDiagnostic,
    #[display("io")]
    Io,
    #[display("failed to parse annotations")]
    Annotations,
    #[display("failed to parse jexpr")]
    JExpr,
    #[display("{_0}")]
    StdoutMismatch(String),
    #[display("{_0}")]
    StderrMismatch(String),
    #[display("assertion failed")]
    Assert,
}

impl error::Error for TrialError {}

fn render_diagnostic<C, S>(
    source: &str,
    diagnostic: Diagnostic<C, SpanId>,
    spans: &SpanStorage<S>,
) -> Result<String, Report<TrialError>>
where
    C: DiagnosticCategory,
    S: hashql_core::span::Span + Clone,
    DiagnosticSpan: for<'s> From<&'s S>,
{
    let resolved = diagnostic
        .resolve(spans)
        .change_context(TrialError::UnableToResolveDiagnostic)?;

    let report = resolved.report(
        ReportConfig {
            color: false,
            ..ReportConfig::default()
        }
        .with_transform_span(|span: &S| DiagnosticSpan::from(span)),
    );

    let mut output = Vec::new();
    report
        .write_for_stdout(Source::from(source), &mut output)
        .expect("infallible");

    Ok(String::from_utf8(output).expect("output should be valid UTF-8"))
}

fn render_stderr<C, S>(
    source: &str,
    spans: &SpanStorage<S>,
    diagnostics: impl IntoIterator<Item = Diagnostic<C, SpanId>>,
) -> Result<Option<String>, Report<TrialError>>
where
    C: DiagnosticCategory,
    S: hashql_core::span::Span + Clone,
    DiagnosticSpan: for<'s> From<&'s S>,
{
    let mut output = Vec::new();

    for diagnostic in diagnostics {
        output.push(render_diagnostic(source, diagnostic, spans)?);
    }

    if output.is_empty() {
        return Ok(None);
    }

    Ok(Some(output.join("\n\n")))
}

pub(crate) struct TrialContext {
    bless: bool,
}

pub(crate) struct Trial {
    suite: &'static dyn Suite,
    path: PathBuf,
    ignore: bool,
    annotations: FileAnnotations,
}

impl Trial {
    fn from_test(case: TestCase) -> Self {
        let suite = suite(&case.spec.suite).expect("suite should be available");

        let file = File::open_buffered(&case.path).expect("should be able to open file");
        let mut annotations = FileAnnotations::new(
            case.path
                .file_stem()
                .expect("path should have file stem")
                .to_str()
                .expect("path name should be valid utf-8"),
        );

        annotations
            .parse_file(file, false)
            .expect("should be able to parse file");

        Self {
            suite,
            path: case.path,
            ignore: matches!(annotations.directive.run, RunMode::Skip { .. }),
            annotations,
        }
    }

    fn filter(&mut self, filterset: &Filterset, context: EvalContext, binary_query: BinaryQuery) {
        let matches = filterset.matches_test(
            &TestQuery {
                binary_query,
                test_name: &self.annotations.directive.name,
            },
            &context,
        );

        self.ignore = !matches;
    }

    fn run(&self, context: &TrialContext) -> Result<(), Report<TrialError>> {
        if self.ignore {
            return Ok(());
        }

        let heap = Heap::new();

        let (source, annotations) = self.load_and_parse_source()?;

        let (expr, spans) = self.parse_jexpr(&source, &heap)?;

        let (received_stdout, diagnostics) = self.run_suite(expr)?;

        let received_stderr = render_stderr(&source, &spans, diagnostics)?;

        if context.bless {
            self.bless_outputs(&received_stdout, &received_stderr)?;
        } else {
            self.assert_outputs(received_stdout, received_stderr)?;
        }

        Ok(())
    }

    fn load_and_parse_source(&self) -> Result<(String, FileAnnotations), Report<TrialError>> {
        let source = fs::read_to_string(&self.path).change_context(TrialError::Io)?;
        let cursor = Cursor::new(source.as_str());

        let mut annotations = self.annotations.clone();
        annotations
            .parse_file(cursor, true)
            .change_context(TrialError::Annotations)?;

        Ok((source, annotations))
    }

    // Parse source with J-Expr
    fn parse_jexpr<'heap>(
        &self,
        source: &str,
        heap: &'heap Heap,
    ) -> Result<(Expr<'heap>, Arc<SpanStorage<Span>>), Report<TrialError>> {
        let spans = Arc::new(SpanStorage::new());
        let parser = Parser::new(heap, Arc::clone(&spans));

        let expr = parser
            .parse_expr(source.as_bytes())
            .change_context(TrialError::JExpr)?;

        Ok((expr, spans))
    }

    // Execute test and collect diagnostics
    fn run_suite(
        &self,
        expr: Expr,
    ) -> Result<
        (
            Option<String>,
            Vec<Diagnostic<impl DiagnosticCategory, SpanId>>,
        ),
        Report<TrialError>,
    > {
        let mut diagnostics = vec![];

        // TODO: check annotation diagnostics

        let result = self.suite.run(expr, &mut diagnostics);

        let received_stdout = result.as_ref().ok().cloned();

        // Collect all diagnostics, including any error result
        let diagnostics = match result {
            Ok(_) => diagnostics,
            Err(error) => diagnostics.into_iter().chain(iter::once(error)).collect(),
        };

        Ok((received_stdout, diagnostics))
    }

    fn bless_outputs(
        &self,
        stdout: &Option<String>,
        stderr: &Option<String>,
    ) -> Result<(), Report<TrialError>> {
        let stdout_file = self.path.with_extension("stdout");
        let stderr_file = self.path.with_extension("stderr");

        match stdout {
            Some(stdout) => fs::write(&stdout_file, stdout).change_context(TrialError::Io)?,
            None => {
                if stdout_file.exists() {
                    fs::remove_file(&stdout_file).change_context(TrialError::Io)?;
                }
            }
        }

        match stderr {
            Some(stderr) => fs::write(&stderr_file, stderr).change_context(TrialError::Io)?,
            None => {
                if stderr_file.exists() {
                    fs::remove_file(&stderr_file).change_context(TrialError::Io)?;
                }
            }
        }

        Ok(())
    }

    fn assert_outputs(
        &self,
        received_stdout: Option<String>,
        received_stderr: Option<String>,
    ) -> Result<(), Report<TrialError>> {
        let stdout_file = self.path.with_extension("stdout");
        let stderr_file = self.path.with_extension("stderr");

        let received_stdout = received_stdout.unwrap_or_default();
        let received_stderr = received_stderr.unwrap_or_default();

        // Load expected outputs
        #[expect(clippy::if_then_some_else_none, reason = "false positive")]
        let expected_stdout = if stdout_file.exists() {
            fs::read_to_string(&stdout_file).change_context(TrialError::Io)?
        } else {
            String::new()
        };

        #[expect(clippy::if_then_some_else_none, reason = "false positive")]
        let expected_stderr = if stderr_file.exists() {
            fs::read_to_string(&stderr_file).change_context(TrialError::Io)?
        } else {
            String::new()
        };

        let mut sink = ReportSink::new_armed();

        // Assert equality
        if received_stdout != expected_stdout {
            let diff = SimpleDiff::from_str(
                expected_stdout.as_str(),
                received_stdout.as_str(),
                "Expected Std",
                "Received",
            );

            sink.append(Report::new(TrialError::StdoutMismatch(diff.to_string())));
        }

        if received_stderr != expected_stderr {
            let diff = SimpleDiff::from_str(
                expected_stderr.as_str(),
                received_stderr.as_str(),
                "Expected Std",
                "Received",
            );

            sink.append(Report::new(TrialError::StderrMismatch(diff.to_string())));
        }

        sink.finish().change_context(TrialError::Assert)
    }
}

pub(crate) struct TrialGroup<'graph> {
    id: &'graph PackageId,
    name: String,
    ignore: bool,
    trials: Vec<Trial>,
}

impl<'graph> TrialGroup<'graph> {
    fn from_test(group: TestGroup, graph: &'graph PackageGraph) -> Self {
        let mut trials = Vec::with_capacity(group.cases.len());

        for case in group.cases {
            trials.push(Trial::from_test(case));
        }

        let package_id = graph
            .resolve_package_name(&group.entry.krate)
            .root_ids(DependencyDirection::Forward)
            .next()
            .expect("should be able to resolve package name");

        Self {
            id: package_id,
            name: group.entry.krate,
            ignore: false,
            trials,
        }
    }

    fn filter(&mut self, filterset: &Filterset, context: EvalContext) {
        let binary_id =
            RustBinaryId::from_parts(&self.name, &RustTestBinaryKind::TEST, "compiletest");

        let binary_query = BinaryQuery {
            package_id: self.id,
            binary_id: &binary_id,
            binary_name: "compiletest",
            kind: &RustTestBinaryKind::TEST,
            platform: BuildPlatform::Target,
        };

        for trial in &mut self.trials {
            trial.filter(filterset, context, binary_query);
        }

        if self.trials.is_empty() || self.trials.iter().all(|trial| trial.ignore) {
            self.ignore = true;
        }
    }

    fn run(&self, context: &TrialContext) -> Result<(), Report<[TrialError]>> {
        if self.ignore {
            return Ok(());
        }

        // We're making use of rayon here, instead of just `thread::scope` so that we don't spam
        // 1000 threads.

        // First collect the values into a `Vec<_>`. That way we can make sure
        // that we fail-slow
        let results: Vec<_> = self
            .trials
            .par_iter()
            .map(|trial| trial.run(context))
            .collect();

        // ... then check if any of the trials failed
        results.into_iter().try_collect_reports()
    }
}

pub(crate) struct TrialSet<'graph> {
    groups: Vec<TrialGroup<'graph>>,
}

impl<'graph> TrialSet<'graph> {
    pub(crate) fn from_test(groups: Vec<TestGroup>, graph: &'graph PackageGraph) -> Self {
        let groups = thread::scope(|scope| {
            let mut handles = Vec::new();

            for group in groups {
                let handle = scope.spawn(|| TrialGroup::from_test(group, graph));
                handles.push(handle);
            }

            handles
                .into_iter()
                .map(|handle| handle.join().expect("should be able to join thread"))
                .collect()
        });

        Self { groups }
    }

    pub(crate) fn filter(&mut self, filter: String, graph: &'graph PackageGraph) {
        let context = ParseContext::new(graph);

        let filterset = Filterset::parse(filter, &context, FiltersetKind::Test)
            .expect("should be a valid filterset expression");

        let context = EvalContext {
            default_filter: &CompiledExpr::ALL,
        };

        for group in &mut self.groups {
            group.filter(&filterset, context);
        }
    }

    pub(crate) fn run(&self, context: &TrialContext) -> Result<(), Report<[TrialError]>> {
        thread::scope(|scope| {
            let mut handles = Vec::new();

            for group in &self.groups {
                let handle = scope.spawn(|| group.run(context));
                handles.push(handle);
            }

            // First collect the values into a `Vec<_>`. That way we can make sure that we fail-slow
            let results: Vec<_> = handles
                .into_iter()
                .map(|handle| handle.join().expect("should be able to join thread"))
                .collect();

            // ... then process the results to ensure a fail-slow behavior
            results.into_iter().try_collect_reports()
        })
    }
}
