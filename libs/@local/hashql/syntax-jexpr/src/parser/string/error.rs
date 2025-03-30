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
    name: "Invalid Expression",
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
pub(crate) fn invalid_expr<I>(
    spans: &SpanStorage<Span>,
    parent: SpanId,
    error: ParseError<I, ContextError>,
) -> StringDiagnostic {
    let mut diagnostic =
        Diagnostic::new(StringDiagnosticCategory::InvalidExpression, Severity::ERROR);

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

    let label_text = expression.map_or_else(
        || format!("Invalid syntax at this position"),
        |expr| format!("Invalid {expr} syntax"),
    );

    diagnostic.labels.push(Label::new(span, label_text));

    let expected = error
        .context()
        .filter_map(|context| match context {
            StrContext::Expected(expected) => Some(expected),
            _ => None,
        })
        .collect::<Vec<_>>();

    if !expected.is_empty() {
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

        diagnostic.help = Some(Help::new(buffer));

        diagnostic.note = Some(Note::new(
            "Check for missing delimiters, incorrect operators, or typos in identifiers.",
        ));
    }

    diagnostic
}
