use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    severity::Severity,
};

use crate::lexer::{error::LexerDiagnosticCategory, syntax_kind_set::SyntaxKindSet};

pub(crate) type ParserDiagnostic = Diagnostic<ParserDiagnosticCategory, SpanId>;

const UNEXPECTED_TOKEN: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unexpected-token",
    name: "Unexpected token",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ParserDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    UnexpectedToken,
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
            Self::UnexpectedToken => Some(&UNEXPECTED_TOKEN),
        }
    }
}

pub(crate) fn unexpected_token(
    span: SpanId,
    expected: SyntaxKindSet,
) -> Diagnostic<ParserDiagnosticCategory, SpanId> {
    let mut diagnostic =
        Diagnostic::new(ParserDiagnosticCategory::UnexpectedToken, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, UNEXPECTED_TOKEN.name));

    let length = expected.len();
    let expected = expected
        .into_iter()
        .enumerate()
        .fold(String::new(), |mut acc, (i, kind)| {
            if i > 0 {
                acc.push_str(", ");
            }

            if i == length - 1 {
                acc.push_str("or ");
            }

            acc.push_str(&kind.to_string());

            acc
        });

    diagnostic.help = Some(Help::new(format!("Expected {expected}",)));

    diagnostic
}
