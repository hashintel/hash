use core::{error::Error, fmt::Display};

use ariadne::ColorGenerator;
use hql_span::{file::FileId, tree::SpanTree};

use crate::{
    category::Category, config::ReportConfig, file_span::FileSpan, help::Help, label::Label,
    note::Note, severity::Severity,
};

#[derive_where::derive_where(Debug)]
#[derive(Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Diagnostic<E> {
    pub category: Category,
    pub severity: Severity,

    pub message: Option<Box<str>>,
    pub span: Option<SpanTree<E>>,

    pub labels: Vec<Label<E>>,
    pub note: Option<Note>,
    pub help: Option<Help>,
}

impl<E> Diagnostic<E> {
    #[must_use]
    pub const fn new(category: Category, severity: Severity) -> Self {
        Self {
            category,
            severity,
            message: None,
            span: None,
            labels: Vec::new(),
            note: None,
            help: None,
        }
    }

    pub fn report(&self, source: FileId, config: ReportConfig) -> ariadne::Report<FileSpan> {
        let start = self
            .span
            .as_ref()
            .map_or(0, |span| u32::from(span.absolute().start()));

        let mut generator = ColorGenerator::new();

        let mut builder = ariadne::Report::build(self.severity.kind(), source, start as usize)
            .with_code(self.category.canonical_id());

        builder.set_message(self.message.as_deref().unwrap_or(self.category.name));

        if let Some(note) = &self.note {
            builder.set_note(note.colored(config.color));
        }

        if let Some(help) = &self.help {
            builder.set_help(help.colored(config.color));
        }

        for label in &self.labels {
            builder.add_label(label.ariadne(&mut generator));
        }

        builder = builder.with_config(config.into());

        builder.finish()
    }
}

impl<E> Display for Diagnostic<E> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "[{}] {}", self.severity, self.category.canonical_name())
    }
}

impl<E> Error for Diagnostic<E> {}
