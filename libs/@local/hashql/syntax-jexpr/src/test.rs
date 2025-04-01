use hashql_core::span::{SpanId, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic, category::DiagnosticCategory, config::ReportConfig, span::DiagnosticSpan,
};

use crate::span::Span;

pub(crate) fn render_diagnostic<C>(
    source: &str,
    diagnostic: Diagnostic<C, SpanId>,
    spans: &SpanStorage<Span>,
) -> String
where
    C: DiagnosticCategory,
{
    let resolved = diagnostic
        .resolve(spans)
        .expect("span storage should have a reference to every span");

    let report = resolved.report(
        ReportConfig {
            color: false,
            ..ReportConfig::default()
        }
        .with_transform_span(|span: &Span| DiagnosticSpan::from(span)),
    );

    let mut output = Vec::new();
    report
        .write_for_stdout(ariadne::Source::from(source), &mut output)
        .expect("infallible");

    String::from_utf8(output).expect("output should be valid UTF-8")
}
