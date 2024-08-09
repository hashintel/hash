use alloc::{borrow::Cow, sync::Arc};

use hql_diagnostics::{
    category::Category, help::Help, label::Label, rob::RefOrBox, severity::Severity, Diagnostic,
};
use hql_span::SpanId;
use text_size::TextRange;

use crate::error::CATEGORY;

const LEXING: &Category = &Category {
    id: Cow::Borrowed("lexing"),
    name: Cow::Borrowed("Lexing"),
    parent: Some(RefOrBox::Ref(CATEGORY)),
};

const INVALID_STRING: &Category = &Category {
    id: Cow::Borrowed("invalid-string"),
    name: Cow::Borrowed("Invalid String Literal"),
    parent: Some(RefOrBox::Ref(LEXING)),
};

const INVALID_NUMBER: &Category = &Category {
    id: Cow::Borrowed("invalid-number"),
    name: Cow::Borrowed("Invalid Number Literal"),
    parent: Some(RefOrBox::Ref(LEXING)),
};

const INVALID_CHARACTER: &Category = &Category {
    id: Cow::Borrowed("invalid-character"),
    name: Cow::Borrowed("Invalid Character"),
    parent: Some(RefOrBox::Ref(LEXING)),
};

pub(crate) fn from_hifijson_str_error(
    error: &hifijson::str::Error,
    span: SpanId,
) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(INVALID_STRING, Severity::ERROR);

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
) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(INVALID_NUMBER, Severity::ERROR);

    let message = match error {
        hifijson::num::Error::ExpectedDigit => "Expected a digit",
    };

    diagnostic
        .labels
        .push(Label::new(span, Cow::Borrowed(message)));

    diagnostic
}

pub(crate) fn from_unrecognized_character_error(span: SpanId) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(INVALID_CHARACTER, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, Cow::Borrowed("Unrecognized character")));

    diagnostic
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) enum LexingError {
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
