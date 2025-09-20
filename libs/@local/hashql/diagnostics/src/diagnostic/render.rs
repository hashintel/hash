use core::fmt::Display;

use annotate_snippets::{Group, Level, Renderer, Snippet, renderer::DecorStyle};

use super::Diagnostic;
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

#[derive(Debug)]
pub struct RenderOptions<'sources, 'source> {
    pub format: Format,
    pub charset: Charset,
    pub color_depth: ColorDepth,
    pub term_width: usize,
    pub abbreviate: bool,
    pub sources: &'sources Sources<'source>,
}

impl<'sources, 'source> RenderOptions<'sources, 'source> {
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
    pub(crate) fn as_group<'this>(&'this self, options: &'this RenderOptions) -> Group<'this> {
        let severity: Severity = self.severity.into();

        let root = severity_to_level(severity)
            .primary_title(
                self.message
                    .clone()
                    .unwrap_or_else(|| category_display_name(&self.category)),
            )
            .id(CanonicalDiagnosticCategoryId::new(&self.category).to_string());
        let mut root = Group::with_title(root);

        let chunks = self
            .labels
            .chunk_by(|a, b| a.span().source() == b.span().source());

        let mut index = 0;
        for chunk in chunks {
            if chunk.is_empty() {
                // This should never happen, but if it does, we don't want to panic on indexing.
                continue;
            }

            let source = chunk[0].span().source();
            let source = options.sources.get(source).unwrap();

            let snippet = Snippet::source(&*source.content)
                .path(source.path.as_deref())
                .annotations(
                    chunk
                        .iter()
                        .enumerate()
                        .map(|(i, label)| label.as_annotation(index + i == 0)),
                );
            root = root.element(snippet);

            index += chunk.len();
        }

        root = root.elements(
            self.notes
                .iter()
                .chain(severity.notes())
                .map(|note| note.as_message()),
        );

        root = root.elements(
            self.help
                .iter()
                .chain(severity.help())
                .map(|help| help.as_message()),
        );

        root
    }

    #[cfg(feature = "render")]
    pub fn render(&self, options: &RenderOptions) -> impl Display {
        let root = self.as_group(options);

        let renderer = options.as_renderer();
        renderer.render(&[root])
    }
}
