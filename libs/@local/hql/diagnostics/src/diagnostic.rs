use text_size::TextSize;

use crate::{
    category::{Category, Severity},
    label::Label,
    note::Note,
};

pub struct Diagnostic {
    pub category: Category,
    pub severity: Severity,

    pub message: Box<str>,
    pub offset: TextSize,

    pub labels: Vec<Label>,
    pub note: Option<Note>,
}

impl Diagnostic {
    pub fn new(category: Category, severity: Severity, message: impl Into<Box<str>>) -> Self {
        Self {
            category,
            severity,
            message: message.into(),
            offset: TextSize::new(0),
            labels: Vec::new(),
            note: None,
        }
    }
}
