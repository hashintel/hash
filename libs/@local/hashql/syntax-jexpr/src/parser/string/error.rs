use alloc::borrow::Cow;
use core::fmt::Write as _;

use hashql_core::span::{SpanId, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
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

    diagnostic.labels.push(Label::new(
        span,
        expression.map_or_else(|| INVALID_EXPR.name.to_owned(), ToOwned::to_owned),
    ));

    let expected = error
        .context()
        .filter_map(|context| match context {
            StrContext::Expected(expected) => Some(expected),
            _ => None,
        })
        .collect::<Vec<_>>();

    if !expected.is_empty() {
        let mut buffer = String::new();

        buffer.push_str("Expected ");

        for (index, expected) in expected.iter().enumerate() {
            if index != 0 {
                buffer.push_str(", ");
            }

            let _ = write!(buffer, "{expected}");
        }

        diagnostic.help = Some(Help::new(buffer));
    }

    diagnostic
}
