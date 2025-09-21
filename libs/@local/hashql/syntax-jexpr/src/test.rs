use hashql_core::span::{SpanId, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic,
    category::DiagnosticCategory,
    diagnostic::render::{ColorDepth, Format, RenderOptions},
    source::{Source, Sources},
};

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

    let mut sources = Sources::new();
    sources.push(Source::new(source));

    let mut options = RenderOptions::new(Format::Ansi, &sources);
    options.color_depth = ColorDepth::Monochrome;

    resolved.render(options)
}
