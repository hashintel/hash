use hashql_core::span::{SpanId, storage::SpanStorage};
use hashql_diagnostics::{Diagnostic, ReportConfig, category::DiagnosticCategory};

use crate::span::Span;

pub(crate) fn render_diagnostic<C>(
    source: &str,
    diagnostic: Diagnostic<C, SpanId>,
    mut spans: &SpanStorage<Span>,
) -> String
where
    C: DiagnosticCategory,
{
    let resolved = diagnostic
        .resolve(&mut spans)
        .expect("span storage should have a reference to every span");

    let report = resolved.report(ReportConfig {
        color: false,
        ..ReportConfig::default()
    });

    let mut output = Vec::new();
    report
        .write_for_stdout(ariadne::Source::from(source), &mut output)
        .expect("infallible");

    String::from_utf8(output).expect("output should be valid UTF-8")
}
