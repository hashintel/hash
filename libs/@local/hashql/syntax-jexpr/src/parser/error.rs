use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    severity::Severity,
};

use super::{array::error::ArrayDiagnosticCategory, string::error::StringDiagnosticCategory};
use crate::lexer::{error::LexerDiagnosticCategory, syntax_kind_set::SyntaxKindSet};

pub(crate) type ParserDiagnostic = Diagnostic<ParserDiagnosticCategory, SpanId>;

const EXPECTED_LANGUAGE_ITEM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unexpected-token",
    name: "Unexpected token",
};

const EXPECTED_EOF: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-eof",
    name: "Expected EOF",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ParserDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    String(StringDiagnosticCategory),
    Array(ArrayDiagnosticCategory),
    ExpectedLanguageItem,
    ExpectedEof,
}

impl DiagnosticCategory for ParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.id(),
            _ => Cow::Borrowed("parser"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.name(),
            _ => Cow::Borrowed("Parser"),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Lexer(category) => Some(category),
            Self::String(category) => Some(category),
            Self::Array(category) => Some(category),
            Self::ExpectedLanguageItem => Some(&EXPECTED_LANGUAGE_ITEM),
            Self::ExpectedEof => Some(&EXPECTED_EOF),
        }
    }
}

impl From<ArrayDiagnosticCategory> for ParserDiagnosticCategory {
    fn from(value: ArrayDiagnosticCategory) -> Self {
        Self::Array(value)
    }
}

pub(crate) fn unexpected_token<C>(
    span: SpanId,
    category: C,
    expected: SyntaxKindSet,
) -> Diagnostic<C, SpanId> {
    let mut diagnostic = Diagnostic::new(category, Severity::ERROR);

    // More descriptive label that indicates the token wasn't expected in this context
    diagnostic
        .labels
        .push(Label::new(span, "Unexpected token in this context"));

    let length = expected.len();
    let expected = expected
        .into_iter()
        .enumerate()
        .fold(String::new(), |mut acc, (i, kind)| {
            if i > 0 {
                acc.push_str(", ");
            }

            if i == length - 1 && i > 0 {
                acc.push_str("or ");
            }

            acc.push_str(&kind.to_string());

            acc
        });

    diagnostic.help = Some(Help::new(format!("Expected {expected} at this position")));

    diagnostic
}

pub(crate) fn expected_eof(span: SpanId) -> ParserDiagnostic {
    let mut diagnostic = Diagnostic::new(ParserDiagnosticCategory::ExpectedEof, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Unexpected token after end of expression"));

    diagnostic.help = Some(Help::new(
        "Remove this token or check for missing delimiters in the preceding expression",
    ));

    diagnostic
}
