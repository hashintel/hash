use ariadne::{CharSet, IndexType, LabelAttach};

/// Mirror of [`ariadne::Config`]
///
/// This is needed for access to the `ariadne::Config` struct
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[expect(clippy::struct_excessive_bools, reason = "mirror of ariadne::Config")]
pub struct ReportConfig {
    pub cross_gap: bool,
    pub label_attach: LabelAttach,
    pub compact: bool,
    pub underlines: bool,
    pub multiline_arrows: bool,
    pub color: bool,
    pub tab_width: usize,
    pub char_set: CharSet,
    pub index_type: IndexType,
}

impl From<ReportConfig> for ariadne::Config {
    fn from(config: ReportConfig) -> Self {
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

impl Default for ReportConfig {
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
        }
    }
}
