mod annotations;
mod trial;
mod trial_group;

use core::{cmp::Reverse, error};
use std::{self, io, sync::mpsc, thread};

use error_stack::Report;
use guppy::graph::PackageGraph;
use hashql_core::span::{Span, SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic,
    category::DiagnosticCategory,
    diagnostic::render::{ColorDepth, Format, RenderOptions},
    source::{DiagnosticSpan, Source, Sources},
};
use nextest_filtering::{CompiledExpr, EvalContext, Filterset, FiltersetKind, ParseContext};

pub(crate) use self::trial::TrialDescription;
use self::trial_group::TrialGroup;
use crate::{
    OutputFormat, TestGroup, annotation::diagnostic::DiagnosticAnnotation, reporter::Statistics,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub(crate) enum TrialError {
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
    #[display("secondary file {_0} discrepancy, try to bless the output:\n{_1}")]
    SecondaryFileDiscrepancy(&'static str, String),
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
    #[display("Trial suite has created an unexpected secondary file with extension: {_0}")]
    UnexpectedSecondaryFile(&'static str),
    #[display("Unable to complete run {_0}: {_1}")]
    Run(&'static str, &'static str),
}

impl error::Error for TrialError {}

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

#[derive(Debug)]
pub(crate) struct TrialContext {
    pub bless: bool,
}

pub(crate) struct TrialSet<'graph, 'stats> {
    groups: Vec<TrialGroup<'graph, 'stats>>,
}

impl<'graph, 'stats> TrialSet<'graph, 'stats> {
    pub(crate) fn from_test(
        groups: Vec<TestGroup<'graph>>,
        statistics: &'stats Statistics,
    ) -> Self {
        let mut groups: Vec<_> = thread::scope(|scope| {
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

        // Make sure that groups with a higher priority are scheduled first
        groups.sort_unstable_by_key(|group| Reverse(group.max_priority));

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

    pub(crate) fn list(&self, mut output: impl io::Write, format: OutputFormat) -> io::Result<()> {
        for group in &self.groups {
            group.list(&mut output, format)?;
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
