use core::{error, iter};
use std::{
    fs::{self, File},
    io::Cursor,
    path::PathBuf,
    sync::Arc,
    thread,
};

use ariadne::Source;
use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _, TryReportTupleExt};
use guppy::{
    PackageId,
    graph::{DependencyDirection, PackageGraph, cargo::BuildPlatform},
};
use hashql_ast::heap::Heap;
use hashql_core::span::{Span, SpanId, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic, category::DiagnosticCategory, config::ReportConfig, span::DiagnosticSpan,
};
use hashql_syntax_jexpr::Parser;
use nextest_filtering::{
    BinaryQuery, CompiledExpr, EvalContext, Filterset, FiltersetKind, ParseContext, TestQuery,
};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};
use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};
use snapbox::{Assert, Data};

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
    #[display("stdout mismatch")]
    StdoutMismatch,
    #[display("stderr mismatch")]
    StderrMismatch,
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
    S: Span + Clone,
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
    S: Span + Clone,
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

        let source = fs::read_to_string(&self.path).change_context(TrialError::Io)?;
        let cursor = Cursor::new(source.as_str());

        // Actually load the diagnostics
        let mut annotations = self.annotations.clone();
        annotations
            .parse_file(cursor, true)
            .change_context(TrialError::Annotations)?;

        // Parse the content with J-Expr
        let heap = Heap::new();
        let spans = Arc::new(SpanStorage::new());
        let parser = Parser::new(&heap, Arc::clone(&spans));

        // Failing with `?` here is fine, as it suggests that the test itself is invalid J-Expr.
        let expr = parser
            .parse_expr(source.as_bytes())
            .change_context(TrialError::JExpr)?;

        let mut diagnostics = vec![];

        // TODO: check annotation diagnostics

        // We're not at a place where we can no longer just `?` to fail
        let result = self.suite.run(expr, &mut diagnostics);

        let received_stdout = result.as_ref().ok().cloned();

        let diagnostics = match result {
            Ok(_) => diagnostics,
            Err(error) => diagnostics.into_iter().chain(iter::once(error)).collect(),
        };

        // Check that all annotations are fulfilled

        let received_stderr = render_stderr(&source, &spans, diagnostics)?;

        let stdout_file = self.path.with_extension("stdout");
        let stderr_file = self.path.with_extension("stderr");

        if context.bless {
            match received_stdout {
                Some(stdout) => fs::write(&stdout_file, stdout).change_context(TrialError::Io)?,
                None => {
                    if stdout_file.exists() {
                        fs::remove_file(&stdout_file).change_context(TrialError::Io)?;
                    }
                }
            }

            match received_stderr {
                Some(stderr) => fs::write(&stderr_file, stderr).change_context(TrialError::Io)?,
                None => {
                    if stderr_file.exists() {
                        fs::remove_file(&stderr_file).change_context(TrialError::Io)?;
                    }
                }
            }

            return Ok(());
        }

        // Load both stdout and stderr (if they exist)
        #[expect(clippy::if_then_some_else_none, reason = "false positive")]
        let expected_stdout = if stdout_file.exists() {
            Some(fs::read_to_string(&stdout_file).change_context(TrialError::Io)?)
        } else {
            None
        };

        #[expect(clippy::if_then_some_else_none, reason = "false positive")]
        let expected_stderr = if stderr_file.exists() {
            Some(fs::read_to_string(&stderr_file).change_context(TrialError::Io)?)
        } else {
            None
        };

        // Check if the received output matches the expected output
        let assert = Assert::new();

        let stdout = assert
            .try_eq(
                Some(&"stdout"),
                Data::text(received_stdout.unwrap_or_default()),
                Data::text(expected_stdout.unwrap_or_default()),
            )
            .change_context(TrialError::StdoutMismatch);

        let stderr = assert
            .try_eq(
                Some(&"stderr"),
                Data::text(received_stderr.unwrap_or_default()),
                Data::text(expected_stderr.unwrap_or_default()),
            )
            .change_context(TrialError::StderrMismatch);

        (stdout, stderr)
            .try_collect()
            .change_context(TrialError::Assert)?;

        Ok(())
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
