use annotate_snippets::{Group, Level, Renderer, Snippet, renderer::DecorStyle};

use super::{Diagnostic, Label};
use crate::{
    DiagnosticCategory, Severity,
    category::{CanonicalDiagnosticCategoryId, category_display_name},
    severity::SeverityKind,
    source::{AbsoluteDiagnosticSpan, Sources},
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

const fn severity_to_level(severity: Severity) -> Level<'static> {
    match severity {
        Severity::Bug | Severity::Fatal | Severity::Error => Level::ERROR,
        Severity::Warning => Level::WARNING,
        Severity::Note | Severity::Debug => Level::NOTE,
    }
}

impl<C, K> Diagnostic<C, AbsoluteDiagnosticSpan, K>
where
    C: DiagnosticCategory,
    K: SeverityKind,
{
    #[expect(clippy::indexing_slicing, reason = "checked that non-empty")]
    pub(crate) fn as_group<'group>(
        &'group self,
        options: RenderOptions<'group, '_>,
    ) -> Vec<Group<'group>> {
        let severity: Severity = self.severity.into();

        // The first group is always the main group, and here is a stand-in for the actual group.
        // The placeholder does not allocate.
        let mut groups = vec![Group::with_level(Level::ERROR)];

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
            let source = options.sources.get(source).unwrap();

            let snippet = Snippet::source(&*source.content)
                .path(source.path.as_deref())
                .annotations(chunk.iter().map(Label::render));
            group = group.element(snippet);
        }

        let mut messages = Vec::new();
        for message in self.messages.iter().chain(severity.messages()) {
            message.render(options.sources, &mut groups, &mut messages);
        }

        groups[0] = group;
        groups
    }

    pub fn render(&self, options: RenderOptions) -> String {
        use anstream::adapter::strip_str;

        const TERM: anstyle_svg::Term = anstyle_svg::Term::new();

        let groups = self.as_group(options);

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
