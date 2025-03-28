use alloc::{borrow::Cow, sync::Arc};

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    severity::Severity,
};
use text_size::TextRange;

const INVALID_STRING: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-string",
    name: "Invalid String Literal",
};

const INVALID_NUMBER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-number",
    name: "Invalid Number Literal",
};

const INVALID_CHARACTER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-character",
    name: "Invalid Character",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum LexerDiagnosticCategory {
    InvalidString,
    InvalidNumber,
    InvalidCharacter,
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
        }
    }
}

pub(crate) fn from_hifijson_str_error(
    error: &hifijson::str::Error,
    span: SpanId,
) -> Diagnostic<LexerDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::InvalidString, Severity::ERROR);

    let help = match error {
        hifijson::str::Error::Control => Some(Cow::Borrowed(
            "0x00 to 0x1F cannot be used in JSON strings unless escaped",
        )),
        hifijson::str::Error::Escape(error) => Some(Cow::Owned(error.to_string())),
        hifijson::str::Error::Eof => None,
        hifijson::str::Error::Utf8(error) => Some(Cow::Owned(error.to_string())),
    };

    let message = match error {
        hifijson::str::Error::Control => "Invalid ASCII control character",
        hifijson::str::Error::Escape(_) => "Invalid escape sequence",
        hifijson::str::Error::Eof => "Unterminated string literal",
        hifijson::str::Error::Utf8(_) => "Invalid UTF-8 sequence",
    };

    diagnostic
        .labels
        .push(Label::new(span, Cow::Borrowed(message)));

    if let Some(help) = help {
        diagnostic.help = Some(Help::new(help));
    }

    diagnostic
}

pub(crate) fn from_hifijson_num_error(
    error: &hifijson::num::Error,
    span: SpanId,
) -> Diagnostic<LexerDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Severity::ERROR);

    let message = match error {
        hifijson::num::Error::ExpectedDigit => "Expected a digit",
    };

    diagnostic
        .labels
        .push(Label::new(span, Cow::Borrowed(message)));

    diagnostic
}

pub(crate) fn from_unrecognized_character_error(
    span: SpanId,
) -> Diagnostic<LexerDiagnosticCategory, SpanId> {
    let mut diagnostic =
        Diagnostic::new(LexerDiagnosticCategory::InvalidCharacter, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, Cow::Borrowed("Unrecognized character")));

    diagnostic
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) enum LexerError {
    String {
        error: Arc<hifijson::str::Error>,
        range: TextRange,
    },

    Number {
        error: Arc<hifijson::num::Error>,
        range: TextRange,
    },

    #[default]
    UnrecognizedCharacter,
}
