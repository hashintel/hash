use alloc::borrow::Cow;
use core::alloc::Allocator;

use hashql_core::span::{SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic, Label, Patch, Suggestions, diagnostic::Message, severity::Critical,
};

use super::{
    StringErrorContext, insert_range,
    lexer::{LexerDiagnostic, LexerDiagnosticCategory, closing_delimiters},
};
use crate::{
    lexer::{StringError, string::EscapeError},
    span::Span,
};

const VALID_ESCAPES_NOTE: &str =
    r#"valid JSON escapes are `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, and `\uXXXX`"#;

const CONTROL_CHAR_NOTE: &str =
    "ASCII control characters (`0x00` through `0x1F`) must be escaped in JSON strings";

fn control_char_error(span: SpanId, byte: Option<u8>) -> LexerDiagnostic {
    let (label, help_text, replacement): (Cow<'static, str>, Cow<'static, str>, Cow<'static, str>) =
        match byte {
            Some(b'\n') => (
                Cow::Borrowed("unescaped newline in string literal"),
                Cow::Borrowed("escape the newline character"),
                Cow::Borrowed(r"\n"),
            ),
            Some(b'\r') => (
                Cow::Borrowed("unescaped carriage return in string literal"),
                Cow::Borrowed("escape the carriage return"),
                Cow::Borrowed(r"\r"),
            ),
            Some(b'\t') => (
                Cow::Borrowed("unescaped tab in string literal"),
                Cow::Borrowed("escape the tab character"),
                Cow::Borrowed(r"\t"),
            ),
            Some(0x08) => (
                Cow::Borrowed("unescaped backspace in string literal"),
                Cow::Borrowed("escape the backspace character"),
                Cow::Borrowed(r"\b"),
            ),
            Some(0x0C) => (
                Cow::Borrowed("unescaped form feed in string literal"),
                Cow::Borrowed("escape the form feed character"),
                Cow::Borrowed(r"\f"),
            ),
            Some(other) => (
                Cow::Owned(format!(
                    "unescaped control character `0x{other:02X}` in string literal"
                )),
                Cow::Owned(format!(
                    "escape the control character as `\\u00{other:02X}`"
                )),
                Cow::Owned(format!(r"\u00{other:02X}")),
            ),
            None => (
                Cow::Borrowed("unescaped control character in string literal"),
                Cow::Borrowed("escape the control character"),
                Cow::Borrowed(""),
            ),
        };

    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
        .primary(Label::new(span, label));

    if replacement.is_empty() {
        diagnostic.add_message(Message::help(help_text));
    } else {
        let suggestion = Suggestions::patch(Patch::new(span, replacement));
        diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));
    }

    diagnostic.add_message(Message::note(CONTROL_CHAR_NOTE));
    diagnostic
}

fn expected_low_surrogate<A: Allocator>(
    span: SpanId,
    context: &StringErrorContext<A>,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    let mut diagnostic = context.high_surrogate.map_or_else(
        || {
            let label = context.invalid_unit.map_or_else(
                || Cow::Borrowed("unpaired high surrogate escape"),
                |unit| Cow::Owned(format!(r"unpaired high surrogate `\u{unit:04X}`")),
            );
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
                    .primary(Label::new(span, label));
            diagnostic.add_message(Message::help(
                r"follow the high surrogate with a low surrogate escape (`\uDC00`..`\uDFFF`)",
            ));
            diagnostic
        },
        |high_range| {
            let found = context.invalid_unit.map_or_else(
                || Cow::Borrowed(r"expected low surrogate (`\uDC00`..`\uDFFF`)"),
                |unit| {
                    Cow::Owned(format!(
                        r"expected low surrogate (`\uDC00`..`\uDFFF`), found `\u{unit:04X}`"
                    ))
                },
            );
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
                    .primary(Label::new(span, found));
            let high_span = insert_range(spans, high_range);
            diagnostic.add_label(Label::new(high_span, "high surrogate started here"));
            diagnostic.add_message(Message::help(
                r"replace with a low surrogate escape in `\uDC00`..`\uDFFF`",
            ));
            diagnostic
        },
    );
    diagnostic.add_message(Message::note(
        "UTF-16 high surrogates must be paired with a low surrogate",
    ));
    diagnostic
}

fn escape_error<A: Allocator>(
    escape: EscapeError,
    span: SpanId,
    context: &StringErrorContext<A>,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    match escape {
        EscapeError::Kind(b'\'') => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
                    .primary(Label::new(span, r"unnecessary escape sequence `\'`"));
            let suggestion = Suggestions::patch(Patch::new(span, "'"));
            diagnostic.add_message(
                Message::help("use a plain `'` without a backslash").with_suggestions(suggestion),
            );
            diagnostic.add_message(Message::note(
                "single quotes do not need escaping in JSON strings",
            ));
            diagnostic
        }
        EscapeError::Kind(b'0') => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
                    .primary(Label::new(span, r"unknown escape sequence `\0`"));
            let suggestion = Suggestions::patch(Patch::new(span, r"\u0000"));
            diagnostic.add_message(
                Message::help(r"use `\u0000` for the null character").with_suggestions(suggestion),
            );
            diagnostic.add_message(Message::note(VALID_ESCAPES_NOTE));
            diagnostic
        }
        EscapeError::Kind(b'x') => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
                    .primary(Label::new(span, r"unknown escape sequence `\x`"));
            diagnostic.add_message(Message::help(
                r"use a `\uXXXX` Unicode escape instead of `\x`",
            ));
            diagnostic.add_message(Message::note(VALID_ESCAPES_NOTE));
            diagnostic
        }
        EscapeError::Kind(byte) => {
            let label = if (0x20..=0x7E).contains(&byte) && byte != b'`' {
                Cow::Owned(format!("unknown escape sequence `\\{}`", char::from(byte)))
            } else {
                Cow::Borrowed("unknown escape sequence")
            };
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
                    .primary(Label::new(span, label));
            diagnostic.add_message(Message::help(
                r"escape the backslash as `\\` to write a literal backslash",
            ));
            diagnostic.add_message(Message::note(VALID_ESCAPES_NOTE));
            diagnostic
        }
        EscapeError::HexDigit(byte) => {
            let label = if (0x20..=0x7E).contains(&byte) && byte != b'`' {
                Cow::Owned(format!(
                    "invalid hexadecimal digit `{}` in Unicode escape",
                    char::from(byte)
                ))
            } else {
                Cow::Borrowed("invalid character in Unicode escape")
            };
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
                    .primary(Label::new(span, label));
            diagnostic.add_message(Message::help(
                "replace with a hexadecimal digit (`0`-`9`, `a`-`f`, or `A`-`F`)",
            ));
            diagnostic.add_message(Message::note(
                r"`\uXXXX` escapes require four hexadecimal digits",
            ));
            diagnostic
        }
        EscapeError::Surrogate(unit) => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR).primary(
                    Label::new(span, format!(r"unpaired low surrogate `\u{unit:04X}`")),
                );
            diagnostic.add_message(Message::help(
                r"precede the low surrogate with a high surrogate (`\uD800`..`\uDBFF`), or replace it with a valid Unicode scalar",
            ));
            diagnostic.add_message(Message::note(
                "UTF-16 low surrogates cannot appear without a leading high surrogate",
            ));
            diagnostic
        }
        EscapeError::ExpectedLowSurrogate => expected_low_surrogate(span, context, spans),
        EscapeError::Eof => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR).primary(
                    Label::new(span, "incomplete escape sequence before end of input"),
                );
            let open_span = insert_range(spans, context.open_quote);
            diagnostic.add_label(Label::new(open_span, "string started here"));
            diagnostic.add_message(Message::help(
                "complete the escape sequence and close the string with `\"`",
            ));
            diagnostic
        }
    }
}

pub(crate) fn from_string_error<A: Allocator>(
    error: StringError,
    span: SpanId,
    context: &StringErrorContext<A>,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    match error {
        StringError::Control => control_char_error(span, context.control_byte),
        StringError::Escape(escape) => escape_error(escape, span, context, spans),
        StringError::Eof => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR).primary(
                    Label::new(span, "expected closing `\"` before end of input"),
                );
            let open_span = insert_range(spans, context.open_quote);
            diagnostic.add_label(Label::new(open_span, "string started here"));

            let closers = closing_delimiters(&context.unclosed);
            let help = if closers.is_empty() {
                Cow::Borrowed("add a closing quote")
            } else {
                Cow::Owned(format!("add a closing quote and the missing `{closers}`"))
            };

            let suggestion = Suggestions::patch(Patch::new(span, format!("\"{closers}")));
            diagnostic.add_message(Message::help(help).with_suggestions(suggestion));
            diagnostic
        }
        StringError::Utf8(err) => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR)
                    .primary(Label::new(span, "invalid UTF-8 sequence in string literal"));
            diagnostic.add_message(Message::note(err.to_string()));
            diagnostic
        }
    }
}

pub(crate) fn single_quoted_string(span: SpanId, replacement: Option<&str>) -> LexerDiagnostic {
    let mut diagnostic =
        Diagnostic::new(LexerDiagnosticCategory::InvalidString, Critical::ERROR).primary(
            Label::new(span, "single-quoted strings are not allowed in JSON"),
        );

    if let Some(replacement) = replacement {
        let suggestion = Suggestions::patch(Patch::new(span, replacement.to_owned()));
        diagnostic
            .add_message(Message::help("use double quotes instead").with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help(
            "wrap the string in double quotes (`\"...\"`)",
        ));
    }

    diagnostic
}
