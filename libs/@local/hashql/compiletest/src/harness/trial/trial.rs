use std::{
    fs::File,
    io::Cursor,
    path::{Path, PathBuf},
};

use error_stack::{Report, ReportSink, ResultExt as _};
use guppy::graph::PackageMetadata;
use hashql_ast::node::expr::Expr;
use hashql_core::{
    collections::FastHashMap,
    heap::Heap,
    span::{Span, SpanId, SpanTable},
};
use hashql_diagnostics::{
    Diagnostic, DiagnosticCategory, Source, Sources,
    diagnostic::render::{ColorDepth, Format, RenderOptions},
    source::{DiagnosticSpan, SourceId},
};
use hashql_syntax_jexpr::Parser;
use line_index::LineIndex;
use nextest_filtering::{BinaryQuery, EvalContext, Filterset, TestQuery};
use similar_asserts::SimpleDiff;

use super::{
    context::TrialContext,
    error::TrialError,
    stats::{TrialSection, TrialStatistics},
};
use crate::{
    FileAnnotations,
    annotation::{directive::RunMode, verify::verify_annotations},
    harness::test::TestCase,
    suite::{RunContext, RunContextPartial, Suite, SuiteDiagnostic, find_suite},
};

fn render_diagnostic<C, S, R>(
    source: &str,
    resolver: &mut R,
    diagnostic: &Diagnostic<C, S>,
) -> String
where
    C: DiagnosticCategory,
    S: DiagnosticSpan<R>,
{
    let mut sources = Sources::new();
    sources.push(Source::new(source));

    let mut options = RenderOptions::new(Format::Ansi, &sources);
    options.color_depth = ColorDepth::Monochrome;

    diagnostic.render(options, resolver)
}

fn render_stderr<'a, C, S>(
    source: &str,
    mut spans: &SpanTable<S>,
    diagnostics: impl IntoIterator<Item = &'a Diagnostic<C, SpanId>>,
) -> Option<String>
where
    C: DiagnosticCategory + 'a,
    S: Span,
{
    let mut output = Vec::new();

    for diagnostic in diagnostics {
        output.push(render_diagnostic(source, &mut spans, diagnostic));
    }

    if output.is_empty() {
        return None;
    }

    Some(output.join("\n\n"))
}

fn parse_source<'heap>(
    source: &str,
    heap: &'heap Heap,
) -> Result<(Expr<'heap>, SpanTable<hashql_syntax_jexpr::span::Span>), Report<TrialError>> {
    let mut spans = SpanTable::new(SourceId::new_unchecked(0x00));
    let mut parser = Parser::new(heap, &mut spans);

    let expr = parser
        .parse_expr(source.as_bytes())
        .change_context(TrialError::SourceParsing)?;

    Ok((expr, spans))
}

fn bless_output(
    stats: &mut TrialStatistics,
    path: &Path,
    output: Option<&str>,
) -> Result<(), Report<TrialError>> {
    match output {
        Some(output) => stats
            .write_file(path, output)
            .change_context(TrialError::Io),
        None if path.exists() => stats.remove_file(path).change_context(TrialError::Io),
        None => Ok(()),
    }
}

fn assert_output(
    stats: &mut TrialStatistics,
    received: Option<String>,
    expected: &Path,
    make_error: impl Fn(String) -> TrialError,
) -> Result<(), Report<TrialError>> {
    let received = received.unwrap_or_default();

    let expected = if expected.exists() {
        stats
            .read_file_to_string(expected)
            .change_context(TrialError::Io)?
    } else {
        String::new()
    };

    if received == expected {
        return Ok(());
    }

    let diff = SimpleDiff::from_str(expected.as_str(), received.as_str(), "Expected", "Received");

    let error = make_error(diff.to_string());
    Err(Report::new(error))
}

type SuiteOutput = (
    Option<String>,
    Vec<SuiteDiagnostic>,
    FastHashMap<&'static str, String>,
);

pub(crate) struct TrialDescription {
    pub package: String,
    pub namespace: Vec<String>,
    pub name: String,
}

pub struct Trial {
    pub suite: &'static dyn Suite,
    pub path: PathBuf,
    pub namespace: Vec<String>,
    pub ignore: bool,
    pub annotations: FileAnnotations,
}

impl Trial {
    pub(crate) fn from_test(case: TestCase) -> Self {
        let suite = find_suite(&case.spec.suite).expect("suite should be available");

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
            namespace: case.namespace,
            ignore: matches!(annotations.directive.run, RunMode::Skip { .. }),
            annotations,
        }
    }

    pub(crate) fn filter(
        &mut self,
        filterset: &Filterset,
        context: EvalContext,
        query: BinaryQuery,
    ) {
        let mut test_name = self.namespace.join("::");
        test_name.push_str("::");
        test_name.push_str(&self.annotations.directive.name);

        let matches = filterset.matches_test(
            &TestQuery {
                binary_query: query,
                test_name: &test_name,
            },
            &context,
        );

        self.ignore = self.ignore || !matches
    }

    pub(crate) fn include(&self) -> bool {
        !self.ignore
    }

    fn stdout_file(&self) -> PathBuf {
        self.path.with_extension("stdout")
    }

    fn stderr_file(&self) -> PathBuf {
        self.path.with_extension("stderr")
    }

    fn secondary_file(&self, extension: &str) -> PathBuf {
        self.path.with_extension(format!("aux.{extension}"))
    }

    #[tracing::instrument(skip_all, fields(namespace = self.namespace.join("::"), name = self.annotations.directive.name))]
    pub(crate) fn run(
        &self,
        package: &PackageMetadata,
        context: &TrialContext,
    ) -> (TrialStatistics, Result<(), Report<[TrialError]>>) {
        let mut stats = TrialStatistics::new();
        let result = self
            .run_impl(context, &mut stats)
            .attach_opaque_with(|| TrialDescription {
                package: package.name().to_owned(),
                namespace: self.namespace.clone(),
                name: self.annotations.directive.name.clone(),
            });

        (stats, result)
    }

    fn run_impl(
        &self,
        context: &TrialContext,
        stats: &mut TrialStatistics,
    ) -> Result<(), Report<[TrialError]>> {
        // This is *way more* than we need, but allows us to avoid allocating a new slice, which we
        // don't do for speed, but instead do because it keeps the indices stable during printing of
        // types as we don't allocate a new block.
        let heap = Heap::with_capacity(4 * 1024 * 1024); // 4MiB

        let (source, line_index, annotations) =
            stats.time(TrialSection::ReadSource, |stats| self.load_source(stats))?;

        let (expr, spans) = stats.time(TrialSection::Parse, |_| parse_source(&source, &heap))?;

        let (received_stdout, diagnostics, secondary) =
            stats.time(TrialSection::Run, |_| self.run_suite(&heap, expr))?;

        let mut sink = ReportSink::new_armed();

        let result = stats.time(TrialSection::Verify, |_| {
            verify_annotations(
                &source,
                &mut &spans,
                &line_index,
                &diagnostics,
                &annotations.diagnostics,
            )
        });
        sink.attempt(result.change_context(TrialError::Annotation));

        let received_stderr = stats.time(TrialSection::RenderStderr, |_| {
            render_stderr(&source, &spans, &diagnostics)
        });

        let result = stats.time(TrialSection::Assert, |stats| {
            if context.bless {
                self.bless_outputs(
                    stats,
                    received_stdout.as_deref(),
                    received_stderr.as_deref(),
                    secondary,
                )
            } else {
                self.assert_outputs(stats, received_stdout, received_stderr, secondary)
            }
        });

        if let Err(report) = result {
            sink.append(report);
        }

        sink.finish()
    }

    fn load_source(
        &self,
        stats: &mut TrialStatistics,
    ) -> Result<(String, LineIndex, FileAnnotations), Report<TrialError>> {
        let source = stats
            .read_file_to_string(&self.path)
            .change_context(TrialError::Io)?;

        let cursor = Cursor::new(source.as_str());

        let mut annotations = self.annotations.clone();
        annotations
            .parse_file(cursor, true)
            .change_context(TrialError::AnnotationParsing)?;

        let line_index = LineIndex::new(source.as_str());

        Ok((source, line_index, annotations))
    }

    fn run_suite<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
    ) -> Result<SuiteOutput, Report<[TrialError]>> {
        let mut diagnostics = Vec::new();
        let mut secondary_outputs = FastHashMap::default();
        let mut reports = ReportSink::new_armed();

        let result = self.suite.run(
            RunContext::new(RunContextPartial {
                heap,
                diagnostics: &mut diagnostics,
                suite_directives: &self.annotations.directive.suite,
                secondary_outputs: &mut secondary_outputs,
                reports: &mut reports,
            }),
            expr,
        );

        reports.finish()?;

        if self.annotations.directive.run == RunMode::Pass && result.is_err() {
            return Err(Report::new(TrialError::TrialShouldPass).expand());
        }

        if self.annotations.directive.run == RunMode::Fail && result.is_ok() {
            return Err(Report::new(TrialError::TrialShouldFail).expand());
        }

        let (received_stdout, fatal_diagnostic) = match result {
            Ok(stdout) => (Some(stdout), None),
            Err(error) => (None, Some(error)),
        };

        if let Some(fatal) = fatal_diagnostic {
            diagnostics.push(fatal);
        }

        Ok((received_stdout, diagnostics, secondary_outputs))
    }

    fn bless_outputs(
        &self,
        stats: &mut TrialStatistics,
        stdout: Option<&str>,
        stderr: Option<&str>,
        mut secondary: FastHashMap<&'static str, String>,
    ) -> Result<(), Report<[TrialError]>> {
        let stdout_file = self.stdout_file();
        let stderr_file = self.stderr_file();

        let mut sink = ReportSink::new_armed();

        sink.attempt(bless_output(stats, &stdout_file, stdout));
        sink.attempt(bless_output(stats, &stderr_file, stderr));

        for extension in self.suite.secondary_file_extensions() {
            let file = self.secondary_file(extension);
            let content = secondary.remove(extension);
            sink.attempt(bless_output(stats, &file, content.as_deref()));
        }

        for (remaining, _) in secondary {
            sink.capture(TrialError::UnexpectedSecondaryFile(remaining));
        }

        sink.finish()
    }

    fn assert_outputs(
        &self,
        stats: &mut TrialStatistics,
        received_stdout: Option<String>,
        received_stderr: Option<String>,
        mut secondary: FastHashMap<&'static str, String>,
    ) -> Result<(), Report<[TrialError]>> {
        let stdout_file = self.stdout_file();
        let stderr_file = self.stderr_file();

        let mut sink = ReportSink::new_armed();

        sink.attempt(assert_output(
            stats,
            received_stdout,
            &stdout_file,
            TrialError::StdoutDiscrepancy,
        ));
        sink.attempt(assert_output(
            stats,
            received_stderr,
            &stderr_file,
            TrialError::StderrDiscrepancy,
        ));

        for extension in self.suite.secondary_file_extensions() {
            let file = self.secondary_file(extension);
            let content = secondary.remove(extension);
            sink.attempt(assert_output(stats, content, &file, |diff| {
                TrialError::SecondaryFileDiscrepancy(extension, diff)
            }));
        }

        for (remaining, _) in secondary {
            sink.capture(TrialError::UnexpectedSecondaryFile(remaining));
        }

        sink.finish()
    }
}
