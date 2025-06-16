mod annotations;
mod trial;
mod trial_group;

use core::error;
use std::{self, io, sync::mpsc, thread};

use anstream::StripStream;
use ariadne::Source;
use error_stack::Report;
use guppy::graph::PackageGraph;
use hashql_diagnostics::{
    Diagnostic, category::DiagnosticCategory, config::ReportConfig, span::AbsoluteDiagnosticSpan,
};
use nextest_filtering::{CompiledExpr, EvalContext, Filterset, FiltersetKind, ParseContext};

pub(crate) use self::trial::TrialDescription;
use self::trial_group::TrialGroup;
use crate::{TestGroup, annotation::diagnostic::DiagnosticAnnotation, reporter::Statistics};

#[derive(Debug, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub(crate) enum TrialError {
    #[display("could not resolve diagnostic: failed to map spans to source positions")]
    DiagnosticResolution,
    #[display("io")]
    Io,
    #[display("annotation parsing: failed to process test annotations")]
    AnnotationParsing,
    #[display("source parsing: invalid syntax in test code")]
    SourceParsing,
    #[display("stdout discrepancy, try to bless the output:\n{_0}")]
    StdoutDiscrepancy(String),
    #[display("stderr discrepancy, try to bless the output:\n{_0}")]
    StderrDiscrepancy(String),
    #[display("unfulfilled annotation: {_0:?} did not match any emitted diagnostics")]
    UnfulfilledAnnotation(DiagnosticAnnotation),
    #[display("unexpected diagnostic:\n{_0}")]
    UnexpectedDiagnostic(String),
    #[display("Expected trial to fail, but it passed instead")]
    TrialShouldFail,
    #[display("Expected trial to pass, but it failed")]
    TrialShouldPass,
    #[display("Assertion failed for trial: {message}")]
    AssertionFailed { message: String },
}

impl error::Error for TrialError {}

fn render_diagnostic<C>(source: &str, diagnostic: &Diagnostic<C, AbsoluteDiagnosticSpan>) -> String
where
    C: DiagnosticCategory,
{
    let report = diagnostic.report(ReportConfig {
        color: false,
        ..ReportConfig::default()
    });

    let mut writer = StripStream::new(Vec::new());

    report
        .write_for_stdout(Source::from(source), &mut writer)
        .expect("infallible");

    String::from_utf8(writer.into_inner()).expect("output should be valid UTF-8")
}

fn render_stderr<'a, C>(
    source: &str,
    diagnostics: impl IntoIterator<Item = &'a Diagnostic<C, AbsoluteDiagnosticSpan>>,
) -> Option<String>
where
    C: DiagnosticCategory + 'a,
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

#[derive(Debug)]
pub(crate) struct TrialContext {
    pub bless: bool,
}

pub(crate) struct TrialSet<'graph> {
    groups: Vec<TrialGroup<'graph>>,
}

impl<'graph> TrialSet<'graph> {
    pub(crate) fn from_test(groups: Vec<TestGroup<'graph>>, statistics: &Statistics) -> Self {
        let groups = thread::scope(|scope| {
            let mut handles = Vec::new();

            for group in groups {
                let handle = scope.spawn(|| trial_group::TrialGroup::from_test(group, statistics));
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

    pub(crate) fn len(&self) -> usize {
        self.groups.iter().map(TrialGroup::len).sum()
    }

    pub(crate) fn ignored(&self) -> usize {
        self.groups.iter().map(TrialGroup::ignored).sum()
    }

    pub(crate) fn list(&self, mut output: impl io::Write) -> io::Result<()> {
        for group in &self.groups {
            group.list(&mut output)?;
        }

        Ok(())
    }

    pub(crate) fn run(&self, context: &TrialContext) -> Vec<Report<[TrialError]>> {
        thread::scope(|scope| {
            let (tx, rx) = mpsc::channel();

            for group in &self.groups {
                let tx = tx.clone();
                scope.spawn(move || {
                    let result = group.run(context);

                    tx.send(result).expect("should be able to send result");
                });
            }

            // Dropping the sender here means that we will automatically shutdown the receiver once
            // all senders are dropped.
            drop(tx);

            let mut reports = Vec::with_capacity(self.groups.len());

            while let Ok(mut result) = rx.recv() {
                reports.append(&mut result);
            }

            reports
        })
    }
}
