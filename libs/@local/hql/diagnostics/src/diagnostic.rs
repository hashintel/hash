use core::{error::Error, fmt::Display};

use hql_span::{data::SpanTree, TextSize};

use crate::{category::Category, label::Label, note::Note, severity::Severity};

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
        }
    }
}

impl<E> Display for Diagnostic<E> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "[{}] {}", self.severity, self.message)
    }
}

impl<E> Error for Diagnostic<E> {}
