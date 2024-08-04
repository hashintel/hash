use core::{
    error::Error,
    fmt::{Debug, Display},
};

use ariadne::ColorGenerator;
use hql_span::{tree::SpanNode, Span};

use crate::{
    category::Category, config::ReportConfig, file_span::FileSpan, help::Help, label::Label,
    note::Note, severity::Severity,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Diagnostic<S> {
    pub category: Category,
    pub severity: Severity,

    pub message: Option<Box<str>>,
    pub span: Option<SpanNode<S>>,

    pub labels: Vec<Label<S>>,
    pub note: Option<Note>,
    pub help: Option<Help>,
}

impl<S> Diagnostic<S> {
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
}

impl<S> Diagnostic<S>
where
    S: Span,
{
    pub fn report(&self, config: ReportConfig) -> ariadne::Report<FileSpan> {
        let start = self
            .span
            .as_ref()
            .map_or(0, |span| u32::from(span.absolute().start()));

        let mut generator = ColorGenerator::new();

        let mut builder = ariadne::Report::build(self.severity.kind(), (), start as usize)
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

impl<S> Display for Diagnostic<S>
where
    S: Display,
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "[{}] {}", self.severity, self.category.canonical_name())
    }
}

impl<S> Error for Diagnostic<S> where S: Debug + Display {}
