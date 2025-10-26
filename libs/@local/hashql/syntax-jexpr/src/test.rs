use hashql_core::span::{SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic,
    category::DiagnosticCategory,
    diagnostic::render::{ColorDepth, Format, RenderOptions},
    source::{Source, Sources},
};

use crate::span::Span;

pub(crate) fn render_diagnostic<C>(
    source: &str,
    diagnostic: &Diagnostic<C, SpanId>,
    mut spans: &SpanTable<Span>,
) -> String
where
    C: DiagnosticCategory,
{
    let mut sources = Sources::new();
    sources.push(Source::new(source));

    let mut options = RenderOptions::new(Format::Ansi, &sources);
    options.color_depth = ColorDepth::Monochrome;

    diagnostic.render(options, &mut spans)
}
