use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    severity::Severity,
};

use super::{
    array::error::ArrayDiagnosticCategory, object::error::ObjectDiagnosticCategory,
    string::error::StringDiagnosticCategory,
};
use crate::lexer::error::LexerDiagnosticCategory;

pub(crate) type ParserDiagnostic = Diagnostic<ParserDiagnosticCategory, SpanId>;

const EXPECTED_LANGUAGE_ITEM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unexpected-token",
    name: "Unexpected token",
};

const EXPECTED_EOF: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-eof",
    name: "Unexpected token after expression",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ParserDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    String(StringDiagnosticCategory),
    Array(ArrayDiagnosticCategory),
    Object(ObjectDiagnosticCategory),
    ExpectedLanguageItem,
    ExpectedEof,
}

impl DiagnosticCategory for ParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category)
            | Self::Object(ObjectDiagnosticCategory::Lexer(category))
            | Self::Array(ArrayDiagnosticCategory::Lexer(category)) => category.id(),
            Self::String(_)
            | Self::Array(_)
            | Self::Object(_)
            | Self::ExpectedLanguageItem
            | Self::ExpectedEof => Cow::Borrowed("parser"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category)
            | Self::Object(ObjectDiagnosticCategory::Lexer(category))
            | Self::Array(ArrayDiagnosticCategory::Lexer(category)) => category.name(),
            Self::String(_)
            | Self::Array(_)
            | Self::Object(_)
            | Self::ExpectedLanguageItem
            | Self::ExpectedEof => Cow::Borrowed("Parser"),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Lexer(category) => category.subcategory(),
            Self::String(category) => Some(category),
            Self::Array(category) => Some(category.hoist()),
            Self::Object(category) => Some(category.hoist()),
            Self::ExpectedLanguageItem => Some(&EXPECTED_LANGUAGE_ITEM),
            Self::ExpectedEof => Some(&EXPECTED_EOF),
        }
    }
}

impl From<LexerDiagnosticCategory> for ParserDiagnosticCategory {
    fn from(value: LexerDiagnosticCategory) -> Self {
        Self::Lexer(value)
    }
}

impl From<StringDiagnosticCategory> for ParserDiagnosticCategory {
    fn from(value: StringDiagnosticCategory) -> Self {
        Self::String(value)
    }
}

impl From<ArrayDiagnosticCategory> for ParserDiagnosticCategory {
    fn from(value: ArrayDiagnosticCategory) -> Self {
        Self::Array(value)
    }
}

impl From<ObjectDiagnosticCategory> for ParserDiagnosticCategory {
    fn from(value: ObjectDiagnosticCategory) -> Self {
        Self::Object(value)
    }
}

const EXPECTED_EOF_HELP: &str =
    "Remove this token or check for missing delimiters in the preceding expression";

pub(crate) fn expected_eof(span: SpanId) -> ParserDiagnostic {
    let mut diagnostic = Diagnostic::new(ParserDiagnosticCategory::ExpectedEof, Severity::Error);

    diagnostic
        .labels
        .push(Label::new(span, "Extra content after expression"));

    diagnostic.add_help(Help::new(EXPECTED_EOF_HELP));

    diagnostic
}
