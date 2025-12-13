use std::{
    fs::{self, File},
    io::{self, Cursor},
    path::{Path, PathBuf},
    time::Instant,
};

use error_stack::{Report, ReportSink, ResultExt as _};
use guppy::graph::PackageMetadata;
use hashql_ast::node::expr::Expr;
use hashql_core::{collections::FastHashMap, heap::Heap, span::SpanTable};
use hashql_diagnostics::source::SourceId;
use hashql_syntax_jexpr::{Parser, span::Span};
use line_index::LineIndex;
use nextest_filtering::{BinaryQuery, EvalContext, Filterset, TestQuery};
use similar_asserts::SimpleDiff;

use super::{TrialContext, TrialError, annotations::verify_annotations, render_stderr};
use crate::{
    FileAnnotations, OutputFormat, Suite, TestCase,
    annotation::directive::RunMode,
    output::escape_json,
    reporter::Statistics,
    styles::{BLUE, CYAN, GRAY, GREEN, RED, YELLOW},
    suite::{RunContext, RunContextPartial, SuiteDiagnostic, find_suite},
};

fn parse_source<'heap>(
    source: &str,
    heap: &'heap Heap,
) -> Result<(Expr<'heap>, SpanTable<Span>), Report<TrialError>> {
    let mut spans = SpanTable::new(SourceId::new_unchecked(0x00));
    let mut parser = Parser::new(heap, &mut spans);

    let expr = parser
        .parse_expr(source.as_bytes())
        .change_context(TrialError::SourceParsing)?;

    Ok((expr, spans))
}

fn bless_output(path: &Path, output: Option<&str>) -> Result<(), Report<TrialError>> {
    match output {
        Some(output) => fs::write(path, output).change_context(TrialError::Io),
        None if path.exists() => fs::remove_file(path).change_context(TrialError::Io),
        None => Ok(()),
    }
}

fn assert_output(
    received: Option<String>,
    expected: &Path,
    make_error: impl Fn(String) -> TrialError,
) -> Result<(), Report<TrialError>> {
    let received = received.unwrap_or_default();

    let expected = if expected.exists() {
        fs::read_to_string(expected).change_context(TrialError::Io)?
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

pub(crate) struct Trial<'stats> {
    pub suite: &'static dyn Suite,
    pub path: PathBuf,
    pub namespace: Vec<String>,
    pub ignore: bool,
    pub annotations: FileAnnotations,
    pub statistics: &'stats Statistics,
}

impl<'stats> Trial<'stats> {
    pub(crate) fn from_test(case: TestCase, statistics: &'stats Statistics) -> Self {
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
            statistics,
        }
    }

    pub(crate) fn filter(
        &mut self,
        filterset: &Filterset,
        context: EvalContext,
        binary_query: BinaryQuery,
    ) {
        let mut test_name = self.namespace.join("::");
        test_name.push_str("::");
        test_name.push_str(&self.annotations.directive.name);

        let matches = filterset.matches_test(
            &TestQuery {
                binary_query,
                test_name: &test_name,
            },
            &context,
        );

        self.ignore = self.ignore || !matches;
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

    pub(crate) fn list(
        &self,
        mut output: impl io::Write,
        parent: &str,
        parent_ignore: bool,
        format: OutputFormat,
    ) -> io::Result<()> {
        match format {
            OutputFormat::Human => self.list_human(&mut output, parent, parent_ignore),
            OutputFormat::Json => self.list_json(&mut output, parent, parent_ignore),
        }
    }

    fn list_human(
        &self,
        mut output: impl io::Write,
        parent: &str,
        parent_ignore: bool,
    ) -> io::Result<()> {
        match self.annotations.directive.run {
            RunMode::Pass => write!(output, "[{GREEN}PASS{GREEN:#}]"),
            RunMode::Fail => write!(output, "[{RED}FAIL{RED:#}]"),
            RunMode::Skip { .. } => write!(output, "[{YELLOW}SKIP{YELLOW:#}]"),
        }?;

        write!(output, " {CYAN}{parent}::")?;

        for segment in &self.namespace {
            write!(output, "{segment}::")?;
        }

        write!(
            output,
            "{CYAN:#}{BLUE}{}{BLUE:#}",
            self.annotations.directive.name
        )?;

        if parent_ignore {
            write!(output, " ({YELLOW}ignored{YELLOW:#} by parent)")?;
        } else if self.ignore {
            write!(output, " ({YELLOW}ignored{YELLOW:#})")?;
        } else {
            // Test is not ignored, runs normally
        }

        if let Some(description) = &self.annotations.directive.description {
            writeln!(output)?;
            write!(output, "    {GRAY}{description}{GRAY:#}")?;
        }

        Ok(())
    }

    fn list_json(
        &self,
        mut output: impl io::Write,
        parent: &str,
        parent_ignore: bool,
    ) -> io::Result<()> {
        let status = match self.annotations.directive.run {
            RunMode::Pass => "pass",
            RunMode::Fail => "fail",
            RunMode::Skip { .. } => "skip",
        };

        write!(output, r#"{{"name":""#)?;
        escape_json(&mut output, parent)?;
        write!(output, "::")?;
        for segment in &self.namespace {
            escape_json(&mut output, segment)?;
            write!(output, "::")?;
        }
        escape_json(&mut output, &self.annotations.directive.name)?;

        let ignored = parent_ignore || self.ignore;
        write!(output, r#"","status":"{status}","ignored":{ignored}"#)?;

        if let Some(description) = &self.annotations.directive.description {
            write!(output, r#","description":""#)?;
            escape_json(&mut output, description)?;
            write!(output, r#"""#)?;
        }

        write!(output, "}}")?;

        Ok(())
    }

    #[tracing::instrument(skip_all, fields(namespace = self.namespace.join("::"), name = self.annotations.directive.name))]
    pub(crate) fn run(
        &self,
        package: &PackageMetadata,
        context: &TrialContext,
    ) -> Result<(), Report<[TrialError]>> {
        if self.ignore {
            return Ok(());
        }

        let now = Instant::now();
        tracing::debug!("running trial");

        let result = self
            .run_impl(context)
            .attach_opaque_with(|| TrialDescription {
                package: package.name().to_owned(),
                namespace: self.namespace.clone(),
                name: self.annotations.directive.name.clone(),
            });

        if result.is_ok() {
            tracing::info!("trial passed");
            self.statistics.increase_passed(now.elapsed());
        } else {
            tracing::error!("trial failed");
            self.statistics.increase_failed(now.elapsed());
        }

        result
    }

    fn run_impl(&self, context: &TrialContext) -> Result<(), Report<[TrialError]>> {
        // This is *way more* than we need, but allows us to avoid allocating a new slice, which we
        // don't do for speed, but instead do because it keeps the indices stable during printing of
        // types as we don't allocate a new block.
        let heap = Heap::with_capacity(4 * 1024 * 1024); // 4MiB

        let (source, line_index, annotations) = self.load_source()?;

        let (expr, spans) = parse_source(&source, &heap)?;

        let (received_stdout, diagnostics, secondary) = self.run_suite(&heap, expr)?;

        let mut sink = ReportSink::new_armed();

        verify_annotations(
            &source,
            &mut &spans,
            &line_index,
            &diagnostics,
            &annotations.diagnostics,
            &mut sink,
        );

        let received_stderr = render_stderr(&source, &spans, &diagnostics);

        let result = if context.bless {
            self.bless_outputs(
                received_stdout.as_deref(),
                received_stderr.as_deref(),
                secondary,
            )
        } else {
            self.assert_outputs(received_stdout, received_stderr, secondary)
        };

        if let Err(report) = result {
            sink.append(report);
        }

        sink.finish()
    }

    fn load_source(&self) -> Result<(String, LineIndex, FileAnnotations), Report<TrialError>> {
        let source = fs::read_to_string(&self.path).change_context(TrialError::Io)?;
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
        stdout: Option<&str>,
        stderr: Option<&str>,
        mut secondary: FastHashMap<&'static str, String>,
    ) -> Result<(), Report<[TrialError]>> {
        let stdout_file = self.stdout_file();
        let stderr_file = self.stderr_file();

        let mut sink = ReportSink::new_armed();

        sink.attempt(bless_output(&stdout_file, stdout));
        sink.attempt(bless_output(&stderr_file, stderr));

        for extension in self.suite.secondary_file_extensions() {
            let file = self.secondary_file(extension);
            let content = secondary.remove(extension);
            sink.attempt(bless_output(&file, content.as_deref()));
        }

        for (remaining, _) in secondary {
            sink.capture(TrialError::UnexpectedSecondaryFile(remaining));
        }

        sink.finish()
    }

    fn assert_outputs(
        &self,
        received_stdout: Option<String>,
        received_stderr: Option<String>,
        mut secondary: FastHashMap<&'static str, String>,
    ) -> Result<(), Report<[TrialError]>> {
        let stdout_file = self.stdout_file();
        let stderr_file = self.stderr_file();

        let mut sink = ReportSink::new_armed();

        sink.attempt(assert_output(
            received_stdout,
            &stdout_file,
            TrialError::StdoutDiscrepancy,
        ));
        sink.attempt(assert_output(
            received_stderr,
            &stderr_file,
            TrialError::StderrDiscrepancy,
        ));

        for extension in self.suite.secondary_file_extensions() {
            let file = self.secondary_file(extension);
            let content = secondary.remove(extension);
            sink.attempt(assert_output(content, &file, |diff| {
                TrialError::SecondaryFileDiscrepancy(extension, diff)
            }));
        }

        for (remaining, _) in secondary {
            sink.capture(TrialError::UnexpectedSecondaryFile(remaining));
        }

        sink.finish()
    }
}
