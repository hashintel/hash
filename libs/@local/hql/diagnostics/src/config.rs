use ariadne::{CharSet, IndexType, LabelAttach};

/// Mirror of [`ariadne::Config`]
///
/// [`ariadne::Config`] has no way to extract any information out of it, so this struct is used as a
/// mirror. Specifically we need to access the `color` field to determine if we should use colors or
/// not.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[expect(clippy::struct_excessive_bools, reason = "mirror of ariadne::Config")]
pub struct ReportConfig<F> {
    pub cross_gap: bool,
    pub label_attach: LabelAttach,
    pub compact: bool,
    pub underlines: bool,
    pub multiline_arrows: bool,
    pub color: bool,
    pub tab_width: usize,
    pub char_set: CharSet,
    pub index_type: IndexType,
    /// Transform any span contained in a [`SpanNode`] into a `DiagnosticSpan`
    ///
    /// This must implement [`TransformSpan<S>`], where `S` is the type of the span contained in
    /// the [`SpanNode`].
    ///
    /// [`TransformSpan<S>`]: crate::span::TransformSpan
    /// [`SpanNode`]: hql_span::tree::SpanNode
    pub transform_span: F,
}

impl<F> ReportConfig<F> {
    /// Change the span transformation function more ergonomically
    ///
    /// This is because we cannot define [`Default`] on any `F`, so we need to provide a way to
    /// change the span transformation, even if a default configuration is used.
    ///
    /// # Example
    ///
    /// ```
    /// # use hql_diagnostics::span::DiagnosticSpan;
    /// # use hql_diagnostics::config::ReportConfig;
    /// # struct JsonSpan { range: text_size::TextRange }
    ///
    /// ReportConfig::default().with_transform_span(|span: JsonSpan| DiagnosticSpan {
    ///     range: span.range,
    ///     parent_id: None,
    /// });
    /// ```
    pub fn with_transform_span<F2>(self, transform_span: F2) -> ReportConfig<F2> {
        ReportConfig {
            cross_gap: self.cross_gap,
            label_attach: self.label_attach,
            compact: self.compact,
            underlines: self.underlines,
            multiline_arrows: self.multiline_arrows,
            color: self.color,
            tab_width: self.tab_width,
            char_set: self.char_set,
            index_type: self.index_type,
            transform_span,
        }
    }
}

impl<F> From<ReportConfig<F>> for ariadne::Config {
    fn from(config: ReportConfig<F>) -> Self {
        Self::default()
            .with_cross_gap(config.cross_gap)
            .with_label_attach(config.label_attach)
            .with_compact(config.compact)
            .with_underlines(config.underlines)
            .with_multiline_arrows(config.multiline_arrows)
            .with_color(config.color)
            .with_tab_width(config.tab_width)
            .with_char_set(config.char_set)
            .with_index_type(config.index_type)
    }
}

impl Default for ReportConfig<()> {
    fn default() -> Self {
        Self {
            cross_gap: true,
            label_attach: LabelAttach::Middle,
            compact: false,
            underlines: true,
            multiline_arrows: true,
            color: true,
            tab_width: 4,
            char_set: CharSet::Unicode,
            index_type: IndexType::Char,
            transform_span: (),
        }
    }
}
