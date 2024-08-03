use hql_span::{data::SpanTree, TextSize};

use crate::{
    category::{Category, Severity},
    label::Label,
    note::Note,
};

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
