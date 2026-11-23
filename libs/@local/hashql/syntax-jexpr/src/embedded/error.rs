use alloc::borrow::Cow;
use core::fmt::Write as _;

use hashql_core::span::{SpanAncestors, SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic, Label, Patch, Suggestions,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Critical,
};
use text_size::{TextRange, TextSize};
use winnow::error::{ContextError, StrContext, StrContextValue};

use super::combinator::NESTING_LIMIT_LABEL;
use crate::{lexer::RawOffsets, parser::NESTING_LIMIT, span::Span};

const INVALID_EXPR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-expression",
    name: "Invalid string expression",
};

const INVALID_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-type",
    name: "Invalid type annotation",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum StringDiagnosticCategory {
    InvalidExpression,
    InvalidType,
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
            Self::InvalidType => Some(&INVALID_TYPE),
        }
    }
}

pub(crate) type StringDiagnostic<K = Critical> = Diagnostic<StringDiagnosticCategory, SpanId, K>;

/// Range in `raw_quoted` of the character at `decoded_offset` in its decoded string.
///
/// The range starts from the opening quote of `raw_quoted`. Combining it with the string token's
/// parent [`SpanId`] resolves to the offending character or escape sequence in source.
#[expect(
    clippy::string_slice,
    reason = "a parser error offset is a char boundary of `decoded`"
)]
pub(crate) fn raw_error_range(raw_quoted: &str, decoded: &str, decoded_offset: usize) -> TextRange {
    if decoded.is_empty() {
        return TextRange::up_to(TextSize::of(raw_quoted));
    }

    let offsets = RawOffsets::new(raw_quoted);
    let offset = decoded_offset.min(decoded.len());
    let character = decoded[offset..].chars().next().map_or(0, char::len_utf8);

    TextRange::new(
        TextSize::new(offsets.raw(offset)),
        TextSize::new(offsets.raw(offset + character)),
    )
}

pub(crate) struct EmbeddedErrorParts {
    pub span: SpanId,
    pub label: String,
    pub closing_delimiter: Option<char>,
}

fn format_expected_list(expected: &[&StrContextValue]) -> String {
    let mut buffer = String::new();
    for (index, value) in expected.iter().enumerate() {
        if index > 0 {
            if expected.len() == 2 {
                buffer.push_str(" or ");
            } else if index == expected.len() - 1 {
                buffer.push_str(", or ");
            } else {
                buffer.push_str(", ");
            }
        }
        let _ = write!(buffer, "{value}");
    }
    buffer
}

fn format_char_for_label(character: char) -> String {
    if character.is_control() || character == '`' {
        format!("`{}`", character.escape_debug())
    } else {
        format!("`{character}`")
    }
}

/// Converts a winnow [`ContextError`] into a located label and optional closing-delimiter patch.
#[expect(
    clippy::string_slice,
    reason = "winnow error offset always falls on a UTF-8 boundary of `decoded`"
)]
pub(crate) fn convert_parse_error(
    spans: &mut SpanTable<Span>,
    parent: SpanId,
    raw_quoted: &str,
    decoded: &str,
    kind_name: &str,
    start_offset: usize,
    (offset, error): (usize, ContextError),
) -> EmbeddedErrorParts {
    let nesting_limit = error
        .context()
        .any(|context| matches!(context, StrContext::Label(NESTING_LIMIT_LABEL)));

    // The level past the limit is hundreds of characters into the string, where a label on it
    // would say less than one on the string.
    let span = if nesting_limit {
        parent
    } else {
        let range = raw_error_range(raw_quoted, decoded, offset);
        spans.insert(Span::new(range), SpanAncestors::union(&[parent]))
    };

    let expected: Vec<_> = error
        .context()
        .filter_map(|context| match context {
            StrContext::Expected(expected) => Some(expected),
            StrContext::Label(_) | _ => None,
        })
        .collect();

    let closing_delimiter = if offset >= decoded.len()
        && !decoded.is_empty()
        && expected.len() == 1
        && let StrContextValue::CharLiteral(ch @ (')' | '>' | ']' | '`')) = expected[0]
    {
        Some(*ch)
    } else {
        None
    };

    let at_end = offset >= decoded.len();
    let found_char = (!at_end)
        .then(|| decoded[offset..].chars().next())
        .flatten();

    let label = if nesting_limit {
        format!("{kind_name} nested more than {NESTING_LIMIT} levels deep")
    } else if !expected.is_empty() {
        let expected_list = format_expected_list(&expected);
        if at_end {
            format!("expected {expected_list} before end of {kind_name}")
        } else if let Some(ch) = found_char {
            format!(
                "expected {expected_list}, found {}",
                format_char_for_label(ch)
            )
        } else {
            format!("expected {expected_list}")
        }
    } else if at_end {
        format!("unexpected end of {kind_name}")
    } else if let Some(ch) = found_char {
        if offset == start_offset {
            format!(
                "invalid {kind_name} starting with {}",
                format_char_for_label(ch)
            )
        } else {
            format!("unexpected {} in {kind_name}", format_char_for_label(ch))
        }
    } else {
        format!("invalid {kind_name}")
    };

    EmbeddedErrorParts {
        span,
        label,
        closing_delimiter,
    }
}

const EXPR_SYNTAX_NOTE: &str = "string expressions support paths (`a::b`), field accesses \
                                (`a.b`), index accesses (`a[0]`), and `_`";

const TYPE_SYNTAX_NOTE: &str = "types support paths (`Int`, `List<T>`), tuples (`(A, B)`), \
                                structs (`(a: A)`), unions (`A | B`), intersections (`A & B`), \
                                and `_`";

pub(crate) fn invalid_expr(
    spans: &mut SpanTable<Span>,
    parent: SpanId,
    raw_quoted: &str,
    decoded: &str,
    error: (usize, ContextError),
) -> StringDiagnostic {
    if decoded.is_empty() {
        let mut diagnostic =
            Diagnostic::new(StringDiagnosticCategory::InvalidExpression, Critical::ERROR)
                .primary(Label::new(parent, "expression string cannot be empty"));
        diagnostic.add_message(Message::help(
            "provide a path or expression such as `\"x\"`, `\"a.b\"`, or `\"_\"`",
        ));
        diagnostic.add_message(Message::note(EXPR_SYNTAX_NOTE));
        return diagnostic;
    }

    let parts = convert_parse_error(spans, parent, raw_quoted, decoded, "expression", 0, error);

    let mut diagnostic =
        Diagnostic::new(StringDiagnosticCategory::InvalidExpression, Critical::ERROR)
            .primary(Label::new(parts.span, parts.label));

    if let Some(delim) = parts.closing_delimiter {
        let suggestion = Suggestions::patch(Patch::new(parts.span, delim.to_string()));
        diagnostic.add_message(
            Message::help(format!("add the missing `{delim}`")).with_suggestions(suggestion),
        );
    }

    diagnostic.add_message(Message::note(EXPR_SYNTAX_NOTE));
    diagnostic
}

pub(crate) fn invalid_type(
    spans: &mut SpanTable<Span>,
    parent: SpanId,
    key_span: Option<SpanId>,
    raw_quoted: &str,
    decoded: &str,
    error: (usize, ContextError),
) -> StringDiagnostic {
    if decoded.is_empty() {
        let mut diagnostic =
            Diagnostic::new(StringDiagnosticCategory::InvalidType, Critical::ERROR)
                .primary(Label::new(parent, "type annotation cannot be empty"));
        if let Some(key_span) = key_span {
            diagnostic.add_label(Label::new(key_span, "in this `#type` annotation"));
        }
        diagnostic.add_message(Message::help(
            "provide a type such as `\"Int\"`, `\"List<String>\"`, or `\"(a: Int, b: String)\"`",
        ));
        diagnostic.add_message(Message::note(TYPE_SYNTAX_NOTE));
        return diagnostic;
    }

    let parts = convert_parse_error(spans, parent, raw_quoted, decoded, "type", 0, error);

    let mut diagnostic = Diagnostic::new(StringDiagnosticCategory::InvalidType, Critical::ERROR)
        .primary(Label::new(parts.span, parts.label));

    if let Some(key_span) = key_span {
        diagnostic.add_label(Label::new(key_span, "in this `#type` annotation"));
    }

    if let Some(delim) = parts.closing_delimiter {
        let suggestion = Suggestions::patch(Patch::new(parts.span, delim.to_string()));
        diagnostic.add_message(
            Message::help(format!("add the missing `{delim}`")).with_suggestions(suggestion),
        );
    }

    diagnostic.add_message(Message::note(TYPE_SYNTAX_NOTE));
    diagnostic
}
