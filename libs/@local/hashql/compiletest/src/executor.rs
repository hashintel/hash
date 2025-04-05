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
use guppy::graph::{PackageGraph, PackageMetadata, cargo::BuildPlatform};
use hashql_ast::{heap::Heap, node::expr::Expr};
use hashql_core::span::{node::SpanNode, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, canonical_category_name},
    config::ReportConfig,
    help::Help,
    label::Label,
    note::Note,
    span::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};
use hashql_syntax_jexpr::{Parser, span::Span};
use line_index::{LineCol, LineIndex};
use nextest_filtering::{
    BinaryQuery, CompiledExpr, EvalContext, Filterset, FiltersetKind, ParseContext, TestQuery,
};
use nextest_metadata::{RustBinaryId, RustTestBinaryKind};
use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};
use similar_asserts::SimpleDiff;

use crate::{
    FileAnnotations, Suite, TestCase, TestGroup,
    annotation::{diagnostic::DiagnosticAnnotation, directive::RunMode},
    suite::find_suite,
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
    #[display("diagnostic annotation `{_0:?}` was not fulfilled")]
    UnfulfilledDiagnosticAnnotation(DiagnosticAnnotation),
    #[display("unexpected diagnostic: {_0}")]
    UnexpectedDiagnostic(String),
}

impl error::Error for TrialError {}

fn render_diagnostic<C, S>(source: &str, diagnostic: &Diagnostic<C, SpanNode<S>>) -> String
where
    C: DiagnosticCategory,
    S: hashql_core::span::Span + Clone,
    DiagnosticSpan: for<'s> From<&'s S>,
{
    let report = diagnostic.report(
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

    String::from_utf8(output).expect("output should be valid UTF-8")
}

fn render_stderr<'a, C, S>(
    source: &str,
    diagnostics: impl IntoIterator<Item = &'a Diagnostic<C, SpanNode<S>>>,
) -> Option<String>
where
    C: DiagnosticCategory + 'a,
    S: hashql_core::span::Span + Clone + 'a,
    DiagnosticSpan: for<'s> From<&'s S>,
{
    let mut output = Vec::new();

    for diagnostic in diagnostics {
        output.push(render_diagnostic(source, diagnostic));
    }

    if output.is_empty() {
        return None;
    }

    Some(output.join("\n\n"))
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

    fn run(&self, context: &TrialContext) -> Result<(), Report<[TrialError]>> {
        if self.ignore {
            return Ok(());
        }

        let heap = Heap::new();

        let (source, line_index, annotations) = self.load_source()?;

        let (expr, spans) = Self::parse_source(&source, &heap)?;

        let (received_stdout, diagnostics) = self.run_suite(&spans, expr)?;

        let mut sink = ReportSink::new_armed();

        Self::verify_annotations(
            &source,
            &line_index,
            &diagnostics,
            &annotations.diagnostics,
            &mut sink,
        );

        let received_stderr = render_stderr(&source, &diagnostics);

        if context.bless {
            self.bless_outputs(
                received_stdout.as_ref(),
                received_stderr.as_ref(),
                &mut sink,
            );
        } else if let Err(report) = self.assert_outputs(received_stdout, received_stderr) {
            sink.append(report);
        }

        sink.finish()
    }

    fn verify_annotations(
        source: &str,
        line_index: &LineIndex,
        diagnostics: &[Diagnostic<Box<dyn DiagnosticCategory>, SpanNode<Span>>],
        annotations: &[DiagnosticAnnotation],
        sink: &mut ReportSink<TrialError>,
    ) {
        // We cannot clone diagnostics here, because of the fact that they are not `Clone` due to
        // the `dyn Trait`.
        let mut visited = vec![false; diagnostics.len()];

        // Go through every annotation and see if there is a corresponding diagnostic
        for annotation in annotations {
            let query = annotation.message.as_str();

            let matches: Vec<_> = diagnostics
                .iter()
                .enumerate()
                .filter(
                    // 1) Find all diagnostics that haven't been visited yet
                    |&(index, _)| !visited[index],
                )
                .filter_map(|(index, diagnostic)| {
                    // 2) From the candidates, find the ones that have matching line number
                    let Some(line_number) = annotation.line else {
                        return Some((index, diagnostic, diagnostic.labels.clone()));
                    };

                    let labels: Vec<_> = diagnostic
                        .labels
                        .iter()
                        .filter_map(|label| {
                            let absolute_span =
                                AbsoluteDiagnosticSpan::new(label.span(), &mut |span: &Span| {
                                    DiagnosticSpan::from(span)
                                });
                            let range = absolute_span.range();

                            let LineCol {
                                line: start,
                                col: _,
                            } = line_index.line_col(range.start());
                            let LineCol { line: end, col: _ } = line_index.line_col(range.end());

                            (start == line_number || end == line_number).then(|| label.clone())
                        })
                        .collect();

                    if labels.is_empty() {
                        return None;
                    }

                    Some((index, diagnostic, labels))
                })
                .filter(|(_, diagnostic, labels)| {
                    // 3) From the candidates find if there is a matching string in either:
                    // - the labels on the same line
                    // - the help
                    // - the note
                    // - the canonical name
                    let canonical_name = canonical_category_name(&diagnostic.category).to_string();

                    let mut sources = labels
                        .iter()
                        .map(Label::message)
                        .chain(diagnostic.help.as_ref().map(Help::message))
                        .chain(diagnostic.note.as_ref().map(Note::message))
                        .chain(iter::once(canonical_name.as_str()));

                    sources.any(|source| source.contains(query))
                })
                .filter(|(_, diagnostic, _)| {
                    // 4) Find if all the other expectations are fulfilled
                    // - severity
                    // - category
                    let severity_matches = annotation.severity == *diagnostic.severity;

                    let category_matches = annotation.category.as_ref().is_some_and(|category| {
                        let diagnostic_id = hashql_diagnostics::category::canonical_category_id(
                            &diagnostic.category,
                        )
                        .to_string();

                        *category == diagnostic_id
                    });

                    severity_matches && category_matches
                })
                .collect();

            if matches.is_empty() {
                sink.append(Report::new(TrialError::UnfulfilledDiagnosticAnnotation(
                    annotation.clone(),
                )));
                continue;
            }

            // if we have multiple matches, simply choose the first one
            let &(index, _, _) = &matches[0];
            visited[index] = true;
        }

        let unmatched = visited
            .into_iter()
            .enumerate()
            .filter(|&(_, visited)| !visited)
            .map(|(index, _)| &diagnostics[index]);

        for diagnostic in unmatched {
            let diagnostic = render_diagnostic(source, diagnostic);
            sink.append(Report::new(TrialError::UnexpectedDiagnostic(diagnostic)));
        }
    }

    fn load_source(&self) -> Result<(String, LineIndex, FileAnnotations), Report<TrialError>> {
        let source = fs::read_to_string(&self.path).change_context(TrialError::Io)?;
        let cursor = Cursor::new(source.as_str());

        let mut annotations = self.annotations.clone();
        annotations
            .parse_file(cursor, true)
            .change_context(TrialError::Annotations)?;

        let line_index = LineIndex::new(source.as_str());

        Ok((source, line_index, annotations))
    }

    fn parse_source<'heap>(
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
        spans: &SpanStorage<Span>,
        expr: Expr,
    ) -> Result<
        (
            Option<String>,
            Vec<Diagnostic<Box<dyn DiagnosticCategory>, SpanNode<Span>>>,
        ),
        Report<TrialError>,
    > {
        let mut diagnostics = vec![];

        let result = self.suite.run(expr, &mut diagnostics);

        let received_stdout = result.as_ref().ok().cloned();

        let diagnostics = diagnostics
            .into_iter()
            .chain(result.err())
            .map(|diagnostic| diagnostic.resolve(spans))
            .try_collect_reports()
            .change_context(TrialError::UnableToResolveDiagnostic)?;

        Ok((received_stdout, diagnostics))
    }

    fn bless_outputs(
        &self,
        stdout: Option<&String>,
        stderr: Option<&String>,
        sink: &mut ReportSink<TrialError>,
    ) {
        let stdout_file = self.path.with_extension("stdout");
        let stderr_file = self.path.with_extension("stderr");

        match stdout {
            Some(stdout) => {
                sink.attempt(fs::write(&stdout_file, stdout).change_context(TrialError::Io));
            }
            None => {
                if stdout_file.exists() {
                    sink.attempt(fs::remove_file(&stdout_file).change_context(TrialError::Io));
                }
            }
        }

        match stderr {
            Some(stderr) => {
                sink.attempt(fs::write(&stderr_file, stderr).change_context(TrialError::Io));
            }
            None => {
                if stderr_file.exists() {
                    sink.attempt(fs::remove_file(&stderr_file).change_context(TrialError::Io));
                }
            }
        }
    }

    fn assert_outputs(
        &self,
        received_stdout: Option<String>,
        received_stderr: Option<String>,
    ) -> Result<(), Report<[TrialError]>> {
        let stdout_file = self.path.with_extension("stdout");
        let stderr_file = self.path.with_extension("stderr");

        let received_stdout = received_stdout.unwrap_or_default();
        let received_stderr = received_stderr.unwrap_or_default();

        let expected_stdout = if stdout_file.exists() {
            fs::read_to_string(&stdout_file).change_context(TrialError::Io)
        } else {
            Ok(String::new())
        };

        let expected_stderr = if stderr_file.exists() {
            fs::read_to_string(&stderr_file).change_context(TrialError::Io)
        } else {
            Ok(String::new())
        };

        let (expected_stdout, expected_stderr) =
            (expected_stdout, expected_stderr).try_collect()?;

        let mut sink = ReportSink::new_armed();

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

        sink.finish()
    }
}

pub(crate) struct TrialGroup<'graph> {
    ignore: bool,
    trials: Vec<Trial>,
    metadata: PackageMetadata<'graph>,
}

impl<'graph> TrialGroup<'graph> {
    fn from_test(group: TestGroup<'graph>) -> Self {
        let mut trials = Vec::with_capacity(group.cases.len());

        for case in group.cases {
            trials.push(Trial::from_test(case));
        }

        Self {
            metadata: group.entry.metadata,
            ignore: false,
            trials,
        }
    }

    fn filter(&mut self, filterset: &Filterset, context: EvalContext) {
        let binary_id = RustBinaryId::from_parts(
            self.metadata.name(),
            &RustTestBinaryKind::TEST,
            "compiletest",
        );

        let binary_query = BinaryQuery {
            package_id: self.metadata.id(),
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
    pub(crate) fn from_test(groups: Vec<TestGroup<'graph>>) -> Self {
        let groups = thread::scope(|scope| {
            let mut handles = Vec::new();

            for group in groups {
                let handle = scope.spawn(|| TrialGroup::from_test(group));
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
