use alloc::borrow::Cow;
use core::error::Error;

use crate::{DiagnosticCategory, category::TerminalDiagnosticCategory};

const SOURCE_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "source-not-found",
    name: "Source Not Found",
};

const SPAN_NOT_FOUND: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "span-not-found",
    name: "Span Not Found",
};

pub enum InternalDiagnosticCategory {
    SourceNotFound,
    SpanNotFound,
}

impl DiagnosticCategory for InternalDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("internal")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Internal")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::SourceNotFound => Some(&SOURCE_NOT_FOUND),
            Self::SpanNotFound => Some(&SPAN_NOT_FOUND),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub enum ResolveError {
    #[display("unknown span {span}")]
    UnknownSpan { span: String },
}

impl Error for ResolveError {}
