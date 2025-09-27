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

/// Output format for rendered diagnostics.
///
/// Controls how the final diagnostic output is formatted and what type of
/// content is generated. The format determines both the visual presentation
/// and the target medium for the diagnostic display.
///
/// # Examples
///
/// ```
/// # #[cfg(feature = "render")] {
/// use hashql_diagnostics::diagnostic::render::Format;
///
/// // For terminal output with ANSI colors and formatting
/// let terminal_format = Format::Ansi;
///
/// // For web documentation or HTML reports
/// let web_format = Format::Html;
///
/// // For vector graphics that can be embedded or displayed
/// let vector_format = Format::Svg;
/// # }
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Format {
    /// ANSI terminal format with color codes and text styling.
    ///
    /// Produces output suitable for display in terminals and consoles that
    /// support ANSI escape sequences. This format includes color highlighting,
    /// text styling (bold, underline), and proper formatting for command-line
    /// interfaces.
    Ansi,

    /// Scalable Vector Graphics (SVG) format.
    ///
    /// Generates diagnostic output as SVG markup, suitable for embedding in
    /// web pages, documentation, or any application that can display vector
    /// graphics. The output maintains high quality at any scale and preserves
    /// all visual formatting.
    Svg,

    /// Hypertext Markup Language (HTML) format.
    ///
    /// Produces diagnostic output as HTML markup with embedded CSS styling.
    /// This format is ideal for web-based diagnostic viewers, documentation
    /// generation, or integration with HTML-based reporting systems.
    Html,
}

/// Color depth capabilities for diagnostic rendering.
///
/// Determines the color support level for the output terminal or display medium.
/// This affects how colors and visual styling are applied to diagnostic output,
/// allowing the renderer to adapt to different terminal capabilities and user
/// preferences.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum ColorDepth {
    /// 16-color ANSI palette.
    ///
    /// Uses the standard 16 ANSI colors (8 basic colors plus bright variants).
    /// This mode is compatible with most terminals and provides basic color
    /// highlighting for different diagnostic elements while maintaining broad
    /// compatibility.
    Ansi16,

    /// 256-color extended ANSI palette.
    ///
    /// Supports the extended 256-color ANSI palette, providing much richer
    /// color options for diagnostic highlighting. This includes the standard
    /// 16 colors plus 216 RGB colors and 24 grayscale colors.
    Ansi256,

    /// Full RGB color support (24-bit color).
    ///
    /// Enables true color support with the full RGB spectrum. This provides
    /// the highest quality color rendering for diagnostics, allowing precise
    /// color matching and smooth gradients. This is the default setting for
    /// modern terminals.
    #[default]
    Rgb,

    /// No color output (monochrome).
    ///
    /// Disables all color output, producing plain text diagnostics suitable
    /// for environments where color is not supported or desired. This mode
    /// relies on text formatting (bold, underline) and spacing for visual
    /// emphasis.
    Monochrome,
}

/// Character set used for diagnostic rendering decorations and symbols.
///
/// Controls which character set is used for drawing diagnostic decorations
/// such as lines, arrows, and other visual elements. This allows the renderer
/// to adapt to different terminal capabilities and font support.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum Charset {
    /// ASCII-only character set for maximum compatibility.
    ///
    /// Uses only basic ASCII characters for diagnostic decorations. This mode
    /// ensures compatibility with older terminals, systems with limited font
    /// support, or environments where Unicode rendering may be problematic.
    /// Decorations use characters like `-`, `|`, `^`, and `~` for visual elements.
    Ascii,

    /// Unicode character set with box-drawing characters.
    ///
    /// Uses Unicode box-drawing characters and symbols for enhanced visual
    /// presentation. This provides cleaner, more professional-looking diagnostic
    /// output with proper lines, arrows, and decorative elements. This is the
    /// default setting for modern terminals with Unicode support.
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

/// Configuration options for rendering diagnostics to various output formats.
///
/// [`RenderOptions`] controls all aspects of how diagnostics are visually presented,
/// from the output format and color scheme to terminal-specific settings like width
/// and character set support.
#[derive(Debug, Copy, Clone)]
pub struct RenderOptions<'sources, 'source> {
    /// The output format for the rendered diagnostic.
    ///
    /// Controls whether the diagnostic is rendered as ANSI terminal output,
    /// HTML markup, or SVG graphics. This determines the structure and
    /// styling of the final output.
    pub format: Format,

    /// Character set used for decorative elements and symbols.
    ///
    /// Determines whether Unicode box-drawing characters or ASCII-only
    /// characters are used for visual elements like lines and arrows.
    /// Choose [`Charset::Ascii`] for maximum compatibility or
    /// [`Charset::Unicode`] for enhanced visual presentation.
    pub charset: Charset,

    /// Color depth and support level for the output.
    ///
    /// Controls the color palette and capabilities used for syntax highlighting
    /// and visual emphasis. Ranges from full RGB color support to monochrome
    /// output for different terminal capabilities.
    pub color_depth: ColorDepth,

    /// Terminal or display width in characters.
    ///
    /// Used to determine line wrapping, spacing, and layout of the diagnostic
    /// output. The renderer uses this to format content appropriately for
    /// the target display width.
    pub term_width: usize,

    /// Whether to use abbreviated/shortened diagnostic messages.
    ///
    /// When `true`, produces more concise diagnostic output suitable for
    /// environments where space is limited. When `false` (default), provides full
    /// detailed diagnostic information with complete context.
    pub abbreviate: bool,

    /// Source code repository for resolving file content and paths.
    ///
    /// Provides access to the original source files referenced by diagnostic
    /// spans. The renderer uses this to extract and display relevant code
    /// snippets with proper syntax highlighting and line numbering.
    pub sources: &'sources Sources<'source>,
}

impl<'sources, 'source> RenderOptions<'sources, 'source> {
    /// Creates new rendering options with the specified format and sources.
    ///
    /// This method initializes rendering options with sensible defaults for displaying
    /// diagnostics to users. The format controls the overall rendering style, while the
    /// sources provide access to the original source code that diagnostics reference.
    ///
    /// These defaults can be customized by modifying the returned [`RenderOptions`] struct.
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

    pub(crate) const fn as_renderer(&self) -> Renderer {
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

pub(crate) fn format_contents(
    format: Format,
    color_depth: ColorDepth,
    mut contents: String,
) -> String {
    const TERM: anstyle_svg::Term = anstyle_svg::Term::new();

    match format {
        Format::Ansi => {}
        Format::Svg => contents = TERM.render_svg(&contents),
        Format::Html => contents = TERM.render_html(&contents),
    }

    match color_depth {
        ColorDepth::Ansi16 | ColorDepth::Ansi256 | ColorDepth::Rgb => {}
        ColorDepth::Monochrome => contents = strip_str(&contents).to_string(),
    }

    contents
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
    pub(crate) fn to_annotation_groups<'group, R>(
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

    /// Renders the diagnostic as a formatted string for display to users.
    ///
    /// This method converts the diagnostic into a human-readable format using the provided
    /// rendering options and span resolver. The output includes the diagnostic message,
    /// source code context with highlighted spans, labels pointing to specific locations,
    /// and any additional notes or suggestions.
    ///
    /// The resolver is used to convert diagnostic spans into actual source code locations. The
    /// rendering options control the visual presentation, including color depth, terminal
    /// width, and formatting style.
    ///
    /// # Examples
    ///
    /// Rendering a diagnostic with rich formatting:
    ///
    /// ```
    /// use hashql_diagnostics::{
    ///     Diagnostic, Label, Severity, Sources,
    ///     diagnostic::render::{Format, RenderOptions},
    /// };
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "syntax_error", name: "Syntax Error"
    /// # };
    /// # struct Span(core::ops::Range<u32>);
    /// # impl core::fmt::Display for Span {
    /// #    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    /// #        write!(f, "{}..{}", self.0.start, self.0.end)
    /// #    }
    /// # }
    /// # impl<R> hashql_diagnostics::source::DiagnosticSpan<R> for Span {
    /// #    fn source(&self) -> hashql_diagnostics::source::SourceId {
    /// #        hashql_diagnostics::source::SourceId::new_unchecked(0)
    /// #    }
    /// #
    /// #    fn span(&self, resolver: &mut R) -> Option<text_size::TextRange> {
    /// #        Some(text_size::TextRange::new(
    /// #            self.0.start.into(),
    /// #            self.0.end.into(),
    /// #        ))
    /// #    }
    /// #
    /// #    fn ancestors(&self, resolver: &mut R) -> impl IntoIterator<Item = Self> + use<R> {
    /// #        []
    /// #    }
    /// # }
    /// # fn make_resolver() { }
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Error);
    /// let label = Label::new(Span(10..15), "unexpected token");
    /// let diagnostic = header.primary(label);
    ///
    /// let sources = Sources::new();
    /// let options = RenderOptions::new(Format::Ansi, &sources);
    /// let mut resolver = make_resolver();
    ///
    /// let output = diagnostic.render(options, &mut resolver);
    /// // Output contains formatted diagnostic with source code context
    /// ```
    ///
    /// Rendering with custom options for different terminals:
    ///
    /// ```
    /// use hashql_diagnostics::{
    ///     Diagnostic, Label, Severity, Sources,
    ///     diagnostic::render::{Charset, ColorDepth, Format, RenderOptions},
    /// };
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "warning", name: "Warning"
    /// # };
    /// # struct Span(core::ops::Range<u32>);
    /// # impl core::fmt::Display for Span {
    /// #    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    /// #        write!(f, "{}..{}", self.0.start, self.0.end)
    /// #    }
    /// # }
    /// # impl<R> hashql_diagnostics::source::DiagnosticSpan<R> for Span {
    /// #    fn source(&self) -> hashql_diagnostics::source::SourceId {
    /// #        hashql_diagnostics::source::SourceId::new_unchecked(0)
    /// #    }
    /// #
    /// #    fn span(&self, resolver: &mut R) -> Option<text_size::TextRange> {
    /// #        Some(text_size::TextRange::new(
    /// #            self.0.start.into(),
    /// #            self.0.end.into(),
    /// #        ))
    /// #    }
    /// #
    /// #    fn ancestors(&self, resolver: &mut R) -> impl IntoIterator<Item = Self> + use<R> {
    /// #        []
    /// #    }
    /// # }
    /// # fn make_resolver() { }
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Warning);
    /// let label = Label::new(Span(5..10), "deprecated usage");
    /// let diagnostic = header.primary(label);
    ///
    /// let sources = Sources::new();
    /// let mut options = RenderOptions::new(Format::Ansi, &sources);
    /// options.charset = Charset::Ascii;
    /// options.color_depth = ColorDepth::Monochrome;
    /// options.term_width = 80;
    ///
    /// let mut resolver = make_resolver();
    /// let output = diagnostic.render(options, &mut resolver);
    /// // Output formatted for ASCII-only terminals without color
    /// ```
    pub fn render<R>(&self, options: RenderOptions, resolver: &mut R) -> String
    where
        S: DiagnosticSpan<R>,
    {
        let groups = self.to_annotation_groups(options, resolver);

        let renderer = options.as_renderer();
        let contents = renderer.render(&groups);

        format_contents(options.format, options.color_depth, contents)
    }
}
