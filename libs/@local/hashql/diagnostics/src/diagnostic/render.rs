use core::fmt::Display;

use annotate_snippets::{Group, Level, Origin, Renderer, Snippet, renderer::DecorStyle};
use anstream::adapter::strip_str;

use super::Diagnostic;
use crate::{
    DiagnosticCategory, Severity,
    category::{
        CanonicalDiagnosticCategoryId, CanonicalDiagnosticCategoryName, category_display_name,
    },
    diagnostic::Message,
    severity::SeverityKind,
    source::{DiagnosticSpan, ResolvedSource, SourceId, SourceSpan, Sources},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Format {
    Ansi,
    Svg,
    Html,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum ColorDepth {
    Ansi16,
    Ansi256,
    #[default]
    Rgb,
    Monochrome,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum Charset {
    Ascii,
    #[default]
    Unicode,
}

impl Charset {
    const fn into_decor(self) -> DecorStyle {
        match self {
            Self::Ascii => DecorStyle::Ascii,
            Self::Unicode => DecorStyle::Unicode,
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub struct RenderOptions<'sources, 'source> {
    pub format: Format,
    pub charset: Charset,
    pub color_depth: ColorDepth,
    pub term_width: usize,
    pub abbreviate: bool,
    pub sources: &'sources Sources<'source>,
}

impl<'sources, 'source> RenderOptions<'sources, 'source> {
    #[must_use]
    pub fn new(format: Format, sources: &'sources Sources<'source>) -> Self {
        Self {
            format,
            charset: Charset::default(),
            color_depth: ColorDepth::default(),
            term_width: 140,
            abbreviate: false,
            sources,
        }
    }

    const fn as_renderer(&self) -> Renderer {
        let renderer = match self.color_depth {
            ColorDepth::Monochrome => Renderer::plain(),
            ColorDepth::Ansi16 | ColorDepth::Ansi256 | ColorDepth::Rgb => Renderer::styled(),
        };

        renderer
            .decor_style(self.charset.into_decor())
            .term_width(self.term_width)
            .short_message(self.abbreviate)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum RenderError<'this, S> {
    SourceNotFound(SourceId),
    SpanNotFound(Option<SourceId>, &'this S),
}

pub(crate) struct RenderContext<'group, 'ctx, 'sources, C> {
    pub sources: &'group Sources<'sources>,
    pub resolver: &'ctx mut C,

    pub groups: Vec<Group<'group>>,
}

const fn severity_to_level(severity: Severity) -> Level<'static> {
    match severity {
        Severity::Bug | Severity::Fatal | Severity::Error => Level::ERROR,
        Severity::Warning => Level::WARNING,
        Severity::Note | Severity::Debug => Level::NOTE,
    }
}

impl<C, S, K> Diagnostic<C, S, K>
where
    C: DiagnosticCategory,
    K: SeverityKind,
{
    pub(crate) fn span_not_found<'group>(
        &'group self,
        span: &S,
        source: Option<&'group ResolvedSource>,
    ) -> Group<'group>
    where
        S: Display,
    {
        let mut group = severity_to_level(Severity::Bug)
            .primary_title("diagnostic rendering failed due to invalid source location")
            .id("internal::render::span-not-found")
            .element(Level::NOTE.message(format!(
                "failed to locate span `{span}` while rendering {} ({})",
                CanonicalDiagnosticCategoryName::new(&self.category),
                CanonicalDiagnosticCategoryId::new(&self.category)
            )));

        if let Some(source) = source
            && let Some(path) = source.path.as_deref()
        {
            group = group.element(Origin::path(path));
        }

        group = group.elements(
            Severity::Bug
                .messages::<!>()
                .iter()
                .map(Message::render_plain),
        );

        group
    }

    pub(crate) fn source_not_found<R>(&self, source: SourceId, resolver: &mut R) -> Group<'_>
    where
        S: DiagnosticSpan<R>,
    {
        // We cannot go the "normal" route here, because there is an error with the diagnostic
        // itself
        let mut group = severity_to_level(Severity::Bug)
            .primary_title("diagnostic rendering failed due to missing source file")
            .id("internal::render::source-not-found")
            .element(Level::NOTE.message(format!(
                "source `{source}` not found while rendering {} ({})",
                CanonicalDiagnosticCategoryName::new(&self.category),
                CanonicalDiagnosticCategoryId::new(&self.category)
            )));

        // Try to see if we can salvage any of the span information to point to the user to the
        // offending input
        let span = self
            .labels
            .iter()
            .find_map(|label| SourceSpan::resolve(label.span(), resolver));

        if let Some(span) = span {
            group = group.element(Level::NOTE.message(format!(
                "the error occurred at byte range {:?}",
                span.range()
            )));
        }

        group = group.elements(
            Severity::Bug
                .messages::<!>()
                .iter()
                .map(Message::render_plain),
        );

        group
    }

    #[expect(clippy::indexing_slicing, reason = "checked that non-empty")]
    pub(crate) fn as_group<'group, R>(
        &'group self,
        options: RenderOptions<'group, '_>,
        resolver: &mut R,
    ) -> Vec<Group<'group>>
    where
        S: DiagnosticSpan<R>,
    {
        let mut context = RenderContext {
            sources: options.sources,
            resolver,
            // The first group is always the main group, and here is a stand-in for the actual
            // group. The placeholder does not allocate.
            groups: vec![Group::with_level(Level::ERROR)],
        };

        let severity: Severity = self.severity.into();

        let title = severity_to_level(severity)
            .primary_title(
                self.title
                    .clone()
                    .unwrap_or_else(|| category_display_name(&self.category)),
            )
            .id(CanonicalDiagnosticCategoryId::new(&self.category).to_string());

        let mut group = Group::with_title(title);

        for chunk in self
            .labels
            .as_slice()
            .chunk_by(|lhs, rhs| lhs.span().source() == rhs.span().source())
        {
            assert!(!chunk.is_empty());

            let source = chunk[0].span().source();
            let Some(source) = options.sources.get(source) else {
                context
                    .groups
                    .push(self.source_not_found(source, context.resolver));
                continue;
            };

            let mut snippet = Snippet::source(&*source.content).path(source.path.as_deref());

            for label in chunk {
                match label.render(&mut context) {
                    Ok(annotation) => snippet = snippet.annotation(annotation),
                    Err(RenderError::SourceNotFound(source)) => context
                        .groups
                        .push(self.source_not_found(source, context.resolver)),
                    Err(RenderError::SpanNotFound(_, span)) => {
                        context.groups.push(self.span_not_found(span, Some(source)));
                    }
                }
            }

            group = group.element(snippet);
        }

        for message in self.messages.iter().chain(severity.messages()) {
            match message.render(&mut context) {
                Ok(Some(message)) => group = group.element(message),
                Ok(None) => {}
                Err(RenderError::SourceNotFound(source)) => context
                    .groups
                    .push(self.source_not_found(source, context.resolver)),
                Err(RenderError::SpanNotFound(source, span)) => context
                    .groups
                    .push(self.span_not_found(span, source.and_then(|id| options.sources.get(id)))),
            }
        }

        context.groups[0] = group;
        context.groups
    }

    pub fn render<R>(&self, options: RenderOptions, resolver: &mut R) -> String
    where
        S: DiagnosticSpan<R>,
    {
        const TERM: anstyle_svg::Term = anstyle_svg::Term::new();

        let groups = self.as_group(options, resolver);

        let renderer = options.as_renderer();
        let mut contents = renderer.render(&groups);

        match options.format {
            Format::Ansi => {}
            Format::Svg => contents = TERM.render_svg(&contents),
            Format::Html => contents = TERM.render_html(&contents),
        }

        match options.color_depth {
            ColorDepth::Ansi16 | ColorDepth::Ansi256 | ColorDepth::Rgb => {}
            ColorDepth::Monochrome => contents = strip_str(&contents).to_string(),
        }

        contents
    }
}
