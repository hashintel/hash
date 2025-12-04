use alloc::{borrow::Cow, sync::Arc};

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};
use text_size::TextRange;

use super::{
    number::{ParseNumberError, ParseNumberErrorKind},
    syntax_kind::SyntaxKind,
    syntax_kind_set::SyntaxKindSet,
};
use crate::lexer::syntax_kind_set::Conjunction;

pub(crate) type LexerDiagnostic = Diagnostic<LexerDiagnosticCategory, SpanId>;

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

const INVALID_UTF8: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-utf8",
    name: "Invalid UTF-8 sequence",
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
    InvalidString,
    InvalidNumber,
    InvalidCharacter,
    InvalidUtf8,
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
            Self::InvalidUtf8 => Some(&INVALID_UTF8),
            Self::UnexpectedEof => Some(&UNEXPECTED_EOF),
            Self::UnexpectedToken => Some(&UNEXPECTED_TOKEN),
        }
    }
}

const CONTROL_CHAR_HELP: &str =
    "ASCII control characters (0x00 to 0x1F) cannot be used in JSON strings unless escaped";

pub(crate) fn from_hifijson_str_error(
    error: &hifijson::str::Error,
    span: SpanId,
) -> Diagnostic<LexerDiagnosticCategory, SpanId> {
    let (message, help) = match error {
        hifijson::str::Error::Control => (
            "Control character not allowed",
            Some(Cow::Borrowed(CONTROL_CHAR_HELP)),
        ),
        hifijson::str::Error::Escape(error) => (
            "Invalid escape sequence",
            Some(Cow::Owned(error.to_string())),
        ),
        hifijson::str::Error::Eof => ("Unterminated string", None),
        hifijson::str::Error::Utf8(error) => (
            "Invalid UTF-8 in string",
            Some(Cow::Owned(error.to_string())),
        ),
    };

    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::InvalidString, Severity::Error)
        .primary(Label::new(span, message));

    if let Some(help) = help {
        diagnostic.add_message(Message::help(help));
    }

    diagnostic
}

pub(crate) fn unexpected_eof(span: SpanId, expected: SyntaxKindSet) -> LexerDiagnostic {
    // Create a more specific label based on what was expected
    let label = if expected.is_empty() || expected.is_complete() {
        "Unexpected end of file".to_owned()
    } else {
        format!(
            "Unexpected end of file, expected {}",
            expected.display(Some(Conjunction::Or))
        )
    };

    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::UnexpectedEof, Severity::Error)
        .primary(Label::new(span, label));

    // Provide specific help based on what was expected
    let help = if expected.contains_closing_delimiter() {
        "Missing closing bracket. Make sure all opening brackets have matching closing brackets."
    } else if expected.contains_separator() {
        "The file ended while parsing an object or array. Make sure all structures are properly \
         closed."
    } else if expected.contains_value() {
        "The file ended where a value was expected. Add a valid JSON value (string, number, \
         object, array, true, false, or null)."
    } else if expected.contains_opening_delimiter() {
        "The file ended where an opening bracket was expected. Complete the expression structure."
    } else {
        "The file ended unexpectedly. Make sure all expressions, brackets, and string literals are \
         properly closed."
    };

    diagnostic.add_message(Message::help(Cow::Borrowed(help)));

    diagnostic
}

pub(crate) fn unexpected_token(
    span: SpanId,
    found: SyntaxKind,
    expected: SyntaxKindSet,
) -> LexerDiagnostic {
    // Create a specific label based on what was found vs what was expected
    let label = if expected.is_empty() {
        format!("Unexpected token {found}")
    } else if expected.is_complete() {
        format!("Invalid syntax found {found}")
    } else {
        format!(
            "Unexpected {}, expected {}",
            found,
            expected.display(Some(Conjunction::Or))
        )
    };

    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::UnexpectedToken, Severity::Error)
        .primary(Label::new(span, label));

    // Provide specific help based on common syntax errors
    let help = if expected.contains_closing_delimiter()
        && SyntaxKindSet::CLOSING_DELIMITER.contains(found)
    {
        "Mismatched closing brackets. Ensure opening and closing brackets match correctly."
    } else if expected.contains_closing_delimiter() {
        "Missing closing bracket. Make sure all opening brackets have matching closing brackets."
    } else if expected.contains_separator() && SyntaxKindSet::CLOSING_DELIMITER.contains(found) {
        "You might be missing a comma between items or have an extra trailing comma."
    } else if expected.contains_value() && SyntaxKindSet::SEPARATORS.contains(found) {
        "Expected a value (string, number, object, array, true, false, or null) here."
    } else if found == SyntaxKind::Colon && !expected.contains(SyntaxKind::Colon) {
        "Colons are only used in objects to separate keys from values."
    } else if found == SyntaxKind::Comma && !expected.contains(SyntaxKind::Comma) {
        "Commas are only used to separate items in arrays and objects."
    } else {
        "Check your JSON syntax. Make sure brackets are balanced and all required punctuation is \
         present."
    };

    diagnostic.add_message(Message::help(Cow::Borrowed(help)));

    diagnostic
}

const INVALID_NUMBER_HELP: &str = "JSON numbers must contain digits and follow the format: \
                                   `[-]digits[.digits][(e|E)[+|-]digits]`";

pub(crate) fn from_number_error(error: ParseNumberErrorKind, span: SpanId) -> LexerDiagnostic {
    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Severity::Error)
        .primary(Label::new(span, error.to_string()));
    diagnostic.add_message(Message::help(INVALID_NUMBER_HELP));

    diagnostic
}

const UNRECOGNIZED_CHAR_HELP: &str = "J-Expr only supports standard JSON syntax. Make sure you're \
                                      using valid JSON tokens like {}, [], strings, numbers, \
                                      true/false, or null.";

pub(crate) fn from_unrecognized_character_error(span: SpanId) -> LexerDiagnostic {
    let mut diagnostic =
        Diagnostic::new(LexerDiagnosticCategory::InvalidCharacter, Severity::Error)
            .primary(Label::new(span, "Unrecognized character"));

    diagnostic.add_message(Message::help(UNRECOGNIZED_CHAR_HELP));

    diagnostic
}

const INVALID_UTF8_HELP: &str = "J-Expr requires valid UTF-8 encoded input. Check for corrupted \
                                 characters or ensure your source is properly encoded as UTF-8.";

pub(crate) fn from_invalid_utf8_error(span: SpanId) -> LexerDiagnostic {
    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::InvalidUtf8, Severity::Error)
        .primary(Label::new(span, "Invalid UTF-8 byte sequence"));

    diagnostic.add_message(Message::help(INVALID_UTF8_HELP));

    diagnostic
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) enum LexerError {
    String {
        error: Arc<hifijson::str::Error>,
        range: TextRange,
    },

    Number(ParseNumberError),

    #[default]
    UnrecognizedCharacter,
}
