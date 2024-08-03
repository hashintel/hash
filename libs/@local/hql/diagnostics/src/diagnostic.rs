use core::{error::Error, fmt::Display};

use ariadne::ColorGenerator;
use hql_span::{data::SpanTree, file::FileId, TextSize};

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

    pub message: Box<str>,
    pub span: SpanTree<E>,

    pub labels: Vec<Label<E>>,
    pub note: Option<Note>,
    pub help: Option<Help>,
}

impl<E> Diagnostic<E> {
    pub fn new(category: Category, severity: Severity, message: impl Into<Box<str>>) -> Self {
        Self {
            category,
            severity,
            message: message.into(),
            span: SpanTree::empty(TextSize::new(0)),
            labels: Vec::new(),
            note: None,
            help: None,
        }
    }

    pub fn report(&self, source: FileId, config: ReportConfig) -> ariadne::Report<FileSpan> {
        let range = self.span.span.range();

        let mut generator = ColorGenerator::new();

        let mut builder =
            ariadne::Report::build(self.severity.kind(), source, usize::from(range.start()))
                .with_code(self.category.canonical_id());

        builder.set_message(self.message.clone());

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
        write!(f, "[{}] {}", self.severity, self.message)
    }
}

impl<E> Error for Diagnostic<E> {}
