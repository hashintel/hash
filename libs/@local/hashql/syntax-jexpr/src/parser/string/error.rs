use alloc::borrow::Cow;
use core::fmt::Write as _;

use hashql_core::span::{SpanAncestors, SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};
use text_size::{TextRange, TextSize};
use winnow::error::{ContextError, StrContext};

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
pub(crate) fn convert_parse_error(
    spans: &mut SpanTable<Span>,
    parent: SpanId,
    (offset, error): (usize, ContextError),
) -> (Label<SpanId>, Option<String>) {
    let span = spans.insert(
        Span {
            range: TextRange::empty(TextSize::new(offset as u32)),
            pointer: None,
        },
        SpanAncestors::union(&[parent]),
    );

    // adapted from the `Display` for `ContextError`.
    let expression = error.context().find_map(|context| match context {
        StrContext::Label(label) => Some(*label),
        StrContext::Expected(_) | _ => None,
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
            StrContext::Label(_) | _ => None,
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

pub(crate) fn invalid_expr(
    spans: &mut SpanTable<Span>,
    parent: SpanId,
    (offset, error): (usize, ContextError),
) -> StringDiagnostic {
    let (label, expected) = convert_parse_error(spans, parent, (offset, error));

    let mut diagnostic =
        Diagnostic::new(StringDiagnosticCategory::InvalidExpression, Severity::Error)
            .primary(label);

    if let Some(expected) = expected {
        diagnostic.add_message(Message::help(expected));
        diagnostic.add_message(Message::note(SYNTAX_ERROR_NOTE));
    }

    diagnostic
}
