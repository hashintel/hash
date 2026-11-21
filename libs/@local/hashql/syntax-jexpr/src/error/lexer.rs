use alloc::borrow::Cow;

use hashql_core::{
    heap::Heap,
    span::{SpanId, SpanTable},
};
use hashql_diagnostics::{
    Diagnostic, Label, Patch, Suggestions,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Critical,
};
use text_size::TextRange;

use super::{
    ConstructorKind, DelimiterKind, EofContext, FieldKind, UnexpectedTokenContext, insert_range,
    suggest_similar,
};
use crate::{
    span::Span,
    syntax_kind::SyntaxKind,
    syntax_kind_set::{Conjunction, SyntaxKindSet},
};

const INVALID_STRING: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-string",
    name: "Invalid string literal",
};

const INVALID_NUMBER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-number",
    name: "Invalid number literal",
};

const INVALID_CHARACTER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-character",
    name: "Invalid character",
};

const INVALID_TOKEN: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-token",
    name: "Invalid token",
};

const UNTERMINATED_BLOCK_COMMENT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unterminated-block-comment",
    name: "Unterminated block comment",
};

const UNEXPECTED_EOF: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unexpected-eof",
    name: "Unexpected end of file",
};

const UNEXPECTED_TOKEN: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unexpected-token",
    name: "Unexpected token",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum LexerDiagnosticCategory {
    /// Malformed string literal, such as an invalid escape or missing closing quote.
    InvalidString,
    InvalidNumber,
    InvalidCharacter,
    /// Unrecognized bare identifier or keyword outside a string.
    InvalidToken,
    UnterminatedBlockComment,
    UnexpectedEof,
    UnexpectedToken,
}

impl DiagnosticCategory for LexerDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("lexer")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Lexer")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::InvalidString => Some(&INVALID_STRING),
            Self::InvalidNumber => Some(&INVALID_NUMBER),
            Self::InvalidCharacter => Some(&INVALID_CHARACTER),
            Self::InvalidToken => Some(&INVALID_TOKEN),
            Self::UnterminatedBlockComment => Some(&UNTERMINATED_BLOCK_COMMENT),
            Self::UnexpectedEof => Some(&UNEXPECTED_EOF),
            Self::UnexpectedToken => Some(&UNEXPECTED_TOKEN),
        }
    }
}

pub(crate) type LexerDiagnostic<K = Critical> = Diagnostic<LexerDiagnosticCategory, SpanId, K>;

pub(crate) fn from_unrecognized_character_error(span: SpanId, character: char) -> LexerDiagnostic {
    let label = if character.is_control() || character == '`' {
        format!("unexpected character `{}`", character.escape_debug())
    } else {
        format!("unexpected character `{character}`")
    };

    let mut diagnostic =
        Diagnostic::new(LexerDiagnosticCategory::InvalidCharacter, Critical::ERROR)
            .primary(Label::new(span, label));
    diagnostic.add_message(Message::help(
        "use valid JSON tokens such as `{`, `}`, `[`, `]`, strings, numbers, `true`, `false`, or \
         `null`",
    ));
    diagnostic
}

const JSON_KEYWORDS: &[&str] = &["true", "false", "null"];

pub(crate) fn invalid_token(span: SpanId, text: &str, heap: Option<&Heap>) -> LexerDiagnostic {
    if matches!(text, "NaN" | "Infinity") {
        let mut diagnostic =
            Diagnostic::new(LexerDiagnosticCategory::InvalidToken, Critical::ERROR).primary(
                Label::new(span, format!("`{text}` is not a valid JSON number")),
            );
        diagnostic.add_message(Message::help(format!(
            "use a finite number, `null`, or a string literal such as `\"{text}\"`"
        )));
        diagnostic.add_message(Message::note(
            "JSON numbers do not support `NaN` or `Infinity`",
        ));
        return diagnostic;
    }

    let mut diagnostic =
        Diagnostic::new(LexerDiagnosticCategory::InvalidToken, Critical::ERROR).primary(
            Label::new(span, format!("unexpected bare identifier `{text}`")),
        );

    if matches!(text, "None" | "none" | "nil" | "NIL" | "undefined") {
        let suggestion = Suggestions::patch(Patch::new(span, "null"));
        diagnostic.add_message(
            Message::help("use `null` for null values in JSON").with_suggestions(suggestion),
        );
        return diagnostic;
    }

    let similar = if text.len() >= 3 {
        suggest_similar(text, JSON_KEYWORDS, heap, 2)
    } else {
        Vec::new()
    };
    if let Some(suggestions) =
        Suggestions::try_from_iter(similar.into_iter().map(|kw| Patch::new(span, kw)))
    {
        diagnostic.add_message(
            Message::help("a similar JSON keyword exists").with_suggestions(suggestions),
        );
    } else {
        let suggestion = Suggestions::patch(Patch::new(span, format!("\"{text}\"")));
        diagnostic.add_message(
            Message::help("wrap the identifier in double quotes").with_suggestions(suggestion),
        );
    }

    diagnostic.add_message(Message::note(
        "J-Expr uses JSON syntax, where identifiers and paths must be double-quoted strings",
    ));
    diagnostic
}

pub(crate) fn unterminated_block_comment(span: SpanId, eof_span: SpanId) -> LexerDiagnostic {
    let mut diagnostic = Diagnostic::new(
        LexerDiagnosticCategory::UnterminatedBlockComment,
        Critical::ERROR,
    )
    .primary(Label::new(span, "unterminated block comment"));

    let suggestion = Suggestions::patch(Patch::new(eof_span, "*/"));
    diagnostic.add_message(
        Message::help("add `*/` to close the block comment").with_suggestions(suggestion),
    );
    diagnostic
}

const fn field_value_eof_help(field: Option<FieldKind>) -> &'static str {
    match field {
        Some(FieldKind::Constructor(ConstructorKind::Literal)) => {
            "add a primitive literal value such as `42`, `\"text\"`, `true`, or `null`"
        }
        Some(FieldKind::Constructor(ConstructorKind::Struct)) => {
            "add a struct body object such as `{\"field\": value}`"
        }
        Some(FieldKind::Constructor(ConstructorKind::Tuple | ConstructorKind::List)) => {
            "add an array of elements such as `[elem1, elem2]`"
        }
        Some(FieldKind::Constructor(ConstructorKind::Dict)) => {
            "add an object `{\"key\": value}` or an array of pairs `[[key, value]]`"
        }
        Some(FieldKind::Type) => "add a type annotation string such as `\"Int\"`",
        None => "add a value for this field",
    }
}

const MAX_UNCLOSED_LABELS: usize = 3;

pub(crate) fn unexpected_eof(
    span: SpanId,
    expected: SyntaxKindSet,
    context: &EofContext,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    match context {
        EofContext::Document => {
            let label = if expected.is_empty() || expected.is_complete() {
                Cow::Borrowed("unexpected end of input")
            } else {
                Cow::Owned(format!(
                    "unexpected end of input, expected {}",
                    expected.display(Some(Conjunction::Or))
                ))
            };
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedEof, Critical::ERROR)
                    .primary(Label::new(span, label));
            diagnostic.add_message(Message::help(
                "provide a J-Expr expression such as `\"x\"`, `[\"fn\", arg]`, or `{\"#literal\": \
                 42}`",
            ));
            diagnostic
        }
        EofContext::FieldColon { key } => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedEof, Critical::ERROR)
                    .primary(Label::new(span, "unexpected end of input, expected `:`"));
            let key_span = insert_range(spans, *key);
            diagnostic.add_label(Label::new(key_span, "after this key"));
            diagnostic.add_message(Message::help("add `:` and a value for this field"));
            diagnostic
        }
        EofContext::FieldValue { key, field } => {
            let label = if expected.is_empty() || expected.is_complete() {
                Cow::Borrowed("unexpected end of input, expected a value")
            } else {
                Cow::Owned(format!(
                    "unexpected end of input, expected {}",
                    expected.display(Some(Conjunction::Or))
                ))
            };
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedEof, Critical::ERROR)
                    .primary(Label::new(span, label));
            let key_span = insert_range(spans, *key);
            let secondary = field.map_or_else(
                || Cow::Borrowed("after this key"),
                |field| Cow::Owned(format!("value required by `{}`", field.key())),
            );
            diagnostic.add_label(Label::new(key_span, secondary));
            diagnostic.add_message(Message::help(field_value_eof_help(*field)));
            diagnostic
        }
        EofContext::UnclosedDelimiters(unclosed) => {
            let mut ordered = unclosed.clone();
            ordered.sort_by_key(|(_, range)| range.start());

            let innermost = ordered.last().map(|(delim, _)| *delim);
            let label = innermost.map_or_else(
                || Cow::Borrowed("unexpected end of input"),
                |delim| {
                    Cow::Owned(format!(
                        "unexpected end of input, expected `{}`",
                        delim.close_str()
                    ))
                },
            );

            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedEof, Critical::ERROR)
                    .primary(Label::new(span, label));

            // Keep total label count bounded (primary + up to 3 unclosed openers).
            let skip = ordered.len().saturating_sub(MAX_UNCLOSED_LABELS);
            for &(delim, open_range) in &ordered[skip..] {
                let open_span = insert_range(spans, open_range);
                diagnostic.add_label(Label::new(
                    open_span,
                    format!("unclosed `{}` opened here", delim.open_str()),
                ));
            }

            if !ordered.is_empty() {
                let closers: String = ordered
                    .iter()
                    .rev()
                    .map(|(delim, _)| delim.close_str())
                    .collect();
                let help_text = if ordered.len() == 1 {
                    format!("add the missing `{closers}`")
                } else {
                    format!("add the missing closing delimiters `{closers}`")
                };
                let suggestion = Suggestions::patch(Patch::new(span, closers));
                diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));
            }

            diagnostic
        }
    }
}

fn unexpected_token_general(
    span: SpanId,
    found: SyntaxKind,
    expected: SyntaxKindSet,
) -> LexerDiagnostic {
    let label = if expected.is_empty() || expected.is_complete() {
        format!("unexpected {found}")
    } else {
        format!(
            "expected {}, found {found}",
            expected.display(Some(Conjunction::Or))
        )
    };

    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::UnexpectedToken, Critical::ERROR)
        .primary(Label::new(span, label));

    if found == SyntaxKind::Colon && !expected.contains(SyntaxKind::Colon) {
        diagnostic.add_message(Message::help("remove the unexpected `:`"));
        diagnostic.add_message(Message::note(
            "colons separate keys from values inside objects",
        ));
    } else if found == SyntaxKind::Comma && !expected.contains(SyntaxKind::Comma) {
        diagnostic.add_message(Message::help("remove the unexpected `,`"));
        diagnostic.add_message(Message::note(
            "commas separate elements in arrays and entries in objects",
        ));
    } else if expected.contains_closing_delimiter() {
        diagnostic.add_message(Message::help(
            "close the enclosing container or check for a missing separator",
        ));
    } else if expected.contains_value() {
        diagnostic.add_message(Message::help(
            "provide a valid JSON value such as a string, number, boolean, `null`, object, or \
             array",
        ));
    } else {
        // The primary label already names the exact expected tokens.
    }

    diagnostic
}

pub(crate) fn unexpected_token(
    span: SpanId,
    found: SyntaxKind,
    expected: SyntaxKindSet,
    context: &UnexpectedTokenContext,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    match context {
        UnexpectedTokenContext::MismatchedDelimiter {
            open,
            expected_close,
        } => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedToken, Critical::ERROR).primary(
                    Label::new(
                        span,
                        format!(
                            "mismatched closing delimiter {found}, expected `{}`",
                            expected_close.close_str()
                        ),
                    ),
                );
            let open_span = insert_range(spans, *open);
            diagnostic.add_label(Label::new(
                open_span,
                format!("unclosed `{}` opened here", expected_close.open_str()),
            ));
            let suggestion = Suggestions::patch(Patch::new(span, expected_close.close_str()));
            diagnostic.add_message(
                Message::help(format!(
                    "replace {found} with `{}`",
                    expected_close.close_str()
                ))
                .with_suggestions(suggestion),
            );
            diagnostic
        }
        UnexpectedTokenContext::MissingComma { after, container } => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedToken, Critical::ERROR).primary(
                    Label::new(
                        span,
                        format!("expected `,` or `{}`, found {found}", container.close_str()),
                    ),
                );
            let insert_span = insert_range(spans, TextRange::empty(*after));
            let suggestion = Suggestions::patch(Patch::new(insert_span, ","));
            let items = match container {
                DelimiterKind::Bracket => "array elements",
                DelimiterKind::Brace => "object entries",
            };
            diagnostic.add_message(
                Message::help(format!("insert `,` between {items}")).with_suggestions(suggestion),
            );
            diagnostic
        }
        UnexpectedTokenContext::MissingColon { key } => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedToken, Critical::ERROR).primary(
                    Label::new(
                        span,
                        format!("expected `:` after object key, found {found}"),
                    ),
                );
            let key_span = insert_range(spans, *key);
            diagnostic.add_label(Label::new(key_span, "after this key"));
            let insert_span = insert_range(spans, TextRange::empty(key.end()));
            let suggestion = Suggestions::patch(Patch::new(insert_span, ":"));
            diagnostic.add_message(
                Message::help("insert `:` between the key and value").with_suggestions(suggestion),
            );
            diagnostic
        }
        UnexpectedTokenContext::BarePrimitiveInExpr { text } => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedToken, Critical::ERROR).primary(
                    Label::new(span, format!("expected an expression, found {found}")),
                );
            let suggestion =
                Suggestions::patch(Patch::new(span, format!("{{\"#literal\": {text}}}")));
            diagnostic.add_message(
                Message::help("wrap the value in a `#literal` object").with_suggestions(suggestion),
            );
            diagnostic.add_message(Message::note(
                "primitive values in J-Expr must be wrapped in `{\"#literal\": ...}`",
            ));
            diagnostic
        }
        UnexpectedTokenContext::ObjectKey => {
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::UnexpectedToken, Critical::ERROR).primary(
                    Label::new(
                        span,
                        format!("expected a string key in object, found {found}"),
                    ),
                );
            diagnostic.add_message(Message::help("use a double-quoted string for object keys"));
            diagnostic
        }
        UnexpectedTokenContext::General => unexpected_token_general(span, found, expected),
    }
}
