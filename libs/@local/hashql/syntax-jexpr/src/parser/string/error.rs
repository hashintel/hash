use alloc::borrow::Cow;
use core::fmt::Write as _;

use hashql_core::span::{SpanId, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};
use text_size::{TextRange, TextSize};
use winnow::error::{ContextError, ParseError, StrContext};

use crate::span::Span;

pub(crate) type StringDiagnostic = Diagnostic<StringDiagnosticCategory, SpanId>;

const INVALID_EXPR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-expression",
    name: "Invalid string expression",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum StringDiagnosticCategory {
    InvalidExpression,
}

impl DiagnosticCategory for StringDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("string")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("String")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {
            Self::InvalidExpression => Some(&INVALID_EXPR),
        }
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "lexer ensures we never parse more than 4GiB"
)]
pub(crate) fn convert_parse_error<I>(
    spans: &SpanStorage<Span>,
    parent: SpanId,
    error: ParseError<I, ContextError>,
) -> (Label<SpanId>, Option<String>) {
    let offset = error.offset();
    let error = error.into_inner();

    let span = spans.insert(Span {
        range: TextRange::empty(TextSize::new(offset as u32)),
        pointer: None,

        parent_id: Some(parent),
    });

    // adapted from the `Display` for `ContextError`.
    let expression = error.context().find_map(|context| match context {
        StrContext::Label(label) => Some(*label),
        _ => None,
    });

    let message = expression.map_or_else(
        || Cow::Borrowed("Syntax error"),
        |expr| Cow::Owned(format!("Invalid {expr}")),
    );

    let label = Label::new(span, message);

    let expected: Vec<_> = error
        .context()
        .filter_map(|context| match context {
            StrContext::Expected(expected) => Some(expected),
            _ => None,
        })
        .collect();

    let expected = if expected.is_empty() {
        None
    } else {
        let mut buffer = String::new();

        if expected.len() == 1 {
            let _ = write!(buffer, "Expected {}", expected[0]);
        } else {
            buffer.push_str("Expected one of: ");

            for (index, value) in expected.iter().enumerate() {
                match index {
                    0 => {}
                    i if i == expected.len() - 1 => buffer.push_str(" or "),
                    _ => buffer.push_str(", "),
                }

                let _ = write!(buffer, "{value}");
            }
        }

        Some(buffer)
    };

    (label, expected)
}

const SYNTAX_ERROR_NOTE: &str =
    "Check for missing delimiters, incorrect operators, or typos in identifiers.";

pub(crate) fn invalid_expr<I>(
    spans: &SpanStorage<Span>,
    parent: SpanId,
    error: ParseError<I, ContextError>,
) -> StringDiagnostic {
    let mut diagnostic =
        Diagnostic::new(StringDiagnosticCategory::InvalidExpression, Severity::Error);

    let (label, expected) = convert_parse_error(spans, parent, error);

    diagnostic.labels.push(label);

    if let Some(expected) = expected {
        diagnostic.add_help(Help::new(expected));
        diagnostic.add_note(Note::new(SYNTAX_ERROR_NOTE));
    }

    diagnostic
}
