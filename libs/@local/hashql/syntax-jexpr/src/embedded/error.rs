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

use crate::span::Span;

pub(crate) type StringDiagnostic<K = Critical> = Diagnostic<StringDiagnosticCategory, SpanId, K>;

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

/// Maps a byte offset inside a decoded JSON string back to its relative range inside `raw_quoted`.
///
/// The returned range starts from the opening quote of `raw_quoted`. Combining it with the string
/// token's parent [`SpanId`] resolves to the offending character or escape sequence in source.
#[expect(
    clippy::cast_possible_truncation,
    clippy::string_slice,
    reason = "lexer enforces source length <= u32::MAX and `raw_quoted` is a validated JSON string"
)]
pub(crate) fn raw_error_range(raw_quoted: &str, decoded: &str, decoded_offset: usize) -> TextRange {
    let raw_len = raw_quoted.len();
    debug_assert!(raw_len >= 2);

    if decoded.is_empty() {
        return TextRange::new(TextSize::new(0), TextSize::new(raw_len as u32));
    }

    if decoded_offset >= decoded.len() {
        return TextRange::empty(TextSize::new((raw_len - 1) as u32));
    }

    // Fast path: unescaped strings map 1:1 with a +1 offset for the opening quote.
    if raw_len == decoded.len() + 2 {
        let ch_len = decoded[decoded_offset..]
            .chars()
            .next()
            .map_or(0, char::len_utf8);
        let start = (1 + decoded_offset) as u32;
        return TextRange::new(TextSize::new(start), TextSize::new(start + ch_len as u32));
    }

    // Slow path for escaped strings: walk raw units and track decoded byte positions.
    let bytes = raw_quoted.as_bytes();
    let content_end = raw_len - 1;
    let mut raw_pos = 1_usize;
    let mut dec_pos = 0_usize;

    while raw_pos < content_end {
        let (raw_step, dec_step) = if bytes[raw_pos] == b'\\' && raw_pos + 1 < content_end {
            if bytes[raw_pos + 1] == b'u' && raw_pos + 6 <= content_end {
                let first = parse_hex4(&bytes[(raw_pos + 2)..(raw_pos + 6)]);
                if first.is_some_and(|unit| (0xD800..=0xDBFF).contains(&unit))
                    && raw_pos + 12 <= content_end
                    && &bytes[(raw_pos + 6)..(raw_pos + 8)] == br"\u"
                {
                    // Paired UTF-16 surrogates decode to a supplementary scalar (4 UTF-8 bytes).
                    (12, 4)
                } else {
                    let dec_len = first
                        .and_then(|unit| char::from_u32(u32::from(unit)))
                        .map_or(1, char::len_utf8);
                    (6, dec_len)
                }
            } else {
                // Single-character escapes (`\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`) decode
                // to one ASCII byte.
                (2, 1)
            }
        } else {
            let ch_len = raw_quoted[raw_pos..]
                .chars()
                .next()
                .map_or(1, char::len_utf8);
            (ch_len, ch_len)
        };

        if dec_pos == decoded_offset {
            return TextRange::new(
                TextSize::new(raw_pos as u32),
                TextSize::new((raw_pos + raw_step) as u32),
            );
        }

        raw_pos += raw_step;
        dec_pos += dec_step;
    }

    TextRange::empty(TextSize::new(content_end as u32))
}

fn parse_hex4(bytes: &[u8]) -> Option<u16> {
    let text = core::str::from_utf8(bytes).ok()?;
    u16::from_str_radix(text, 16).ok()
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
    let range = raw_error_range(raw_quoted, decoded, offset);
    let span = spans.insert(Span::new(range), SpanAncestors::union(&[parent]));

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

    let label = if !expected.is_empty() {
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
