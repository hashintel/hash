use alloc::sync::Arc;
use std::{
    fs::{self, File},
    io::{self, Cursor},
    path::{Path, PathBuf},
};

use anstream::adapter::strip_str;
use error_stack::{
    Report, ReportSink, ResultExt as _, TryReportIteratorExt as _, TryReportTupleExt as _,
};
use guppy::graph::PackageMetadata;
use hashql_ast::node::expr::Expr;
use hashql_core::{heap::Heap, span::storage::SpanStorage};
use hashql_syntax_jexpr::{Parser, span::Span};
use line_index::LineIndex;
use nextest_filtering::{BinaryQuery, EvalContext, Filterset, TestQuery};
use similar_asserts::SimpleDiff;

use super::{TrialContext, TrialError, annotations::verify_annotations, render_stderr};
use crate::{
    FileAnnotations, Suite, TestCase,
    annotation::directive::RunMode,
    reporter::Statistics,
    styles::{BLUE, CYAN, GRAY, GREEN, RED, YELLOW},
    suite::{ResolvedSuiteDiagnostic, find_suite},
};

fn parse_source<'heap>(
    source: &str,
    heap: &'heap Heap,
) -> Result<(Expr<'heap>, Arc<SpanStorage<Span>>), Report<TrialError>> {
    let spans = Arc::new(SpanStorage::new());
    let parser = Parser::new(heap, Arc::clone(&spans));

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

pub(crate) struct TrialDescription {
    pub package: String,
    pub namespace: Vec<String>,
    pub name: String,
}

pub(crate) struct Trial {
    pub suite: &'static dyn Suite,
    pub path: PathBuf,
    pub namespace: Vec<String>,
    pub ignore: bool,
    pub annotations: FileAnnotations,
    pub statistics: Statistics,
}

impl Trial {
    pub(crate) fn from_test(case: TestCase, statistics: &Statistics) -> Self {
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
            statistics: statistics.clone(),
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

    pub(crate) fn list(
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

    #[tracing::instrument(skip_all, fields(namespace = self.namespace.join("::"), name = self.annotations.directive.name))]
    pub(crate) fn run(
        &self,
        package: &PackageMetadata,
        context: &TrialContext,
    ) -> Result<(), Report<[TrialError]>> {
        if self.ignore {
            return Ok(());
        }

        tracing::debug!("running trial");

        let result = self.run_impl(context).attach_lazy(|| TrialDescription {
            package: package.name().to_owned(),
            namespace: self.namespace.clone(),
            name: self.annotations.directive.name.clone(),
        });

        if result.is_ok() {
            tracing::info!("trial passed");
            self.statistics.increase_passed();
        } else {
            tracing::error!("trial failed");
            self.statistics.increase_failed();
        }

        result
    }

    fn run_impl(&self, context: &TrialContext) -> Result<(), Report<[TrialError]>> {
        let heap = Heap::with_capacity(4 * 1024 * 1024); // 4MiB

        let (source, line_index, annotations) = self.load_source()?;

        let (expr, spans) = parse_source(&source, &heap)?;

        let (received_stdout, diagnostics) = self.run_suite(&spans, &heap, expr)?;

        let mut sink = ReportSink::new_armed();

        verify_annotations(
            &source,
            &line_index,
            &diagnostics,
            &annotations.diagnostics,
            &mut sink,
        );

        let received_stderr = render_stderr(&source, &diagnostics);

        let result = if context.bless {
            self.bless_outputs(received_stdout.as_deref(), received_stderr.as_deref())
        } else {
            self.assert_outputs(received_stdout, received_stderr)
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
        mut spans: &SpanStorage<Span>,
        heap: &'heap Heap,
        expr: Expr<'heap>,
    ) -> Result<(Option<String>, Vec<ResolvedSuiteDiagnostic>), Report<TrialError>> {
        let mut diagnostics = vec![];

        let result = self.suite.run(heap, expr, &mut diagnostics);

        if self.annotations.directive.run == RunMode::Pass && result.is_err() {
            return Err(Report::new(TrialError::TrialShouldPass));
        }

        if self.annotations.directive.run == RunMode::Fail && result.is_ok() {
            return Err(Report::new(TrialError::TrialShouldFail));
        }

        let (received_stdout, fatal_diagnostic) = match result {
            Ok(stdout) => (Some(strip_str(&stdout).to_string()), None),
            Err(error) => (None, Some(error)),
        };

        let diagnostics = diagnostics
            .into_iter()
            .chain(fatal_diagnostic)
            .map(|diagnostic| diagnostic.resolve(&mut spans))
            .try_collect_reports()
            .change_context(TrialError::DiagnosticResolution)?;

        Ok((received_stdout, diagnostics))
    }

    fn bless_outputs(
        &self,
        stdout: Option<&str>,
        stderr: Option<&str>,
    ) -> Result<(), Report<[TrialError]>> {
        let stdout_file = self.stdout_file();
        let stderr_file = self.stderr_file();

        let stdout = bless_output(&stdout_file, stdout);
        let stderr = bless_output(&stderr_file, stderr);

        (stdout, stderr).try_collect().map(|((), ())| ())
    }

    fn assert_outputs(
        &self,
        received_stdout: Option<String>,
        received_stderr: Option<String>,
    ) -> Result<(), Report<[TrialError]>> {
        let stdout_file = self.stdout_file();
        let stderr_file = self.stderr_file();

        let stdout = assert_output(received_stdout, &stdout_file, TrialError::StdoutDiscrepancy);
        let stderr = assert_output(received_stderr, &stderr_file, TrialError::StderrDiscrepancy);

        (stdout, stderr).try_collect().map(|((), ())| ())
    }
}
