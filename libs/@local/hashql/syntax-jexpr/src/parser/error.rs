use alloc::borrow::Cow;

use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    severity::Severity,
};
use hashql_span::SpanId;
use winnow::error::{ContextError, ErrMode, ParseError};

use crate::lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet};

const UNEXPECTED_EOF: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unexpected-eof",
    name: "Unexpected end of input",
};

const EXPECTED_EOF: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-eof",
    name: "Expected end of input",
};

const UNEXPECTED_TOKEN: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unexpected-token",
    name: "Unexpected token",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ParserDiagnosticCategory {
    UnexpectedEof,
    ExpectedEof,
    UnexpectedToken,
    String(StringParserDiagnosticCategory),
    Array(ArrayParserDiagnosticCategory),
    Object(ObjectParserDiagnosticCategory),
}

impl DiagnosticCategory for ParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("parser")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Parser")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::UnexpectedEof => Some(&UNEXPECTED_EOF),
            Self::ExpectedEof => Some(&EXPECTED_EOF),
            Self::UnexpectedToken => Some(&UNEXPECTED_TOKEN),
            Self::String(category) => Some(category),
            Self::Array(category) => Some(category),
            Self::Object(category) => Some(category),
        }
    }
}

const INVALID_IDENTIFIER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-identifier",
    name: "Invalid Identifier",
};

const INVALID_SIGNATURE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-signature",
    name: "Invalid Signature",
};

const INVALID_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-type",
    name: "Invalid Type",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum StringParserDiagnosticCategory {
    InvalidIdentifier,
    InvalidSignature,
    InvalidType,
}

impl DiagnosticCategory for StringParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("string")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("String")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::InvalidIdentifier => Some(&INVALID_IDENTIFIER),
            Self::InvalidSignature => Some(&INVALID_SIGNATURE),
            Self::InvalidType => Some(&INVALID_TYPE),
        }
    }
}

const EXPECTED_CALLEE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-callee",
    name: "Expected Callee",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ArrayParserDiagnosticCategory {
    ExpectedCallee,
}

impl DiagnosticCategory for ArrayParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("array")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Array")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::ExpectedCallee => Some(&EXPECTED_CALLEE),
        }
    }
}

const DUPLICATE_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-key",
    name: "Duplicate Key",
};

const REQUIRED_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "required-key",
    name: "Required Key",
};

const UNKNOWN_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unknown-key",
    name: "Unknown Key",
};

const EXPECTED_NON_EMPTY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-non-empty",
    name: "Expected Non-Empty Object",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ObjectParserDiagnosticCategory {
    DuplicateKey,
    RequiredKey,
    UnknownKey,
    ExpectedNonEmpty,
}

impl DiagnosticCategory for ObjectParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("object")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Object")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::DuplicateKey => Some(&DUPLICATE_KEY),
            Self::RequiredKey => Some(&REQUIRED_KEY),
            Self::UnknownKey => Some(&UNKNOWN_KEY),
            Self::ExpectedNonEmpty => Some(&EXPECTED_NON_EMPTY),
        }
    }
}

pub(crate) fn unexpected_eof(span: SpanId) -> Diagnostic<ParserDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(ParserDiagnosticCategory::UnexpectedEof, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Unexpected end of input"));

    diagnostic
}

pub(crate) fn expected_eof(span: SpanId) -> Diagnostic<ParserDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(ParserDiagnosticCategory::ExpectedEof, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Expected end of input"));

    diagnostic
}

pub(crate) fn unexpected_token(
    span: SpanId,
    expected: impl IntoIterator<Item = SyntaxKind>,
) -> Diagnostic<ParserDiagnosticCategory, SpanId> {
    let expected = SyntaxKindSet::from_iter(expected);

    let mut diagnostic =
        Diagnostic::new(ParserDiagnosticCategory::UnexpectedToken, Severity::ERROR);

    diagnostic.labels.push(Label::new(span, "Unexpected token"));

    let length = expected.len();
    let expected = expected
        .into_iter()
        .enumerate()
        .fold(String::new(), |mut acc, (i, kind)| {
            if i > 0 {
                acc.push_str(", ");
            }

            if i == length - 1 {
                acc.push_str("or ");
            }

            acc.push_str(&kind.to_string());

            acc
        });

    diagnostic.help = Some(Help::new(format!("Expected {expected}",)));

    diagnostic
}

// TODO: add context!
fn parse_error_display<I>(error: &ParseError<I, ErrMode<ContextError>>) -> String {
    // `ErrMode` redirects to debug for display purposes, so we use Display instead
    match error.inner() {
        ErrMode::Cut(context) => format!("Parsing Failure: {context}"),
        ErrMode::Backtrack(context) => format!("Parsing Error: {context}"),
        other @ ErrMode::Incomplete(_) => other.to_string(),
    }
}

pub(crate) fn invalid_identifier<I>(
    span: SpanId,
    error: &ParseError<I, ErrMode<ContextError>>,
) -> Diagnostic<StringParserDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(
        StringParserDiagnosticCategory::InvalidIdentifier,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, Cow::Owned(parse_error_display(error))));

    diagnostic
}

pub(crate) fn invalid_signature<I>(
    span: SpanId,
    error: &ParseError<I, ErrMode<ContextError>>,
) -> Diagnostic<StringParserDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(
        StringParserDiagnosticCategory::InvalidSignature,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, Cow::Owned(parse_error_display(error))));

    diagnostic
}

pub(crate) fn invalid_type<I>(
    span: SpanId,
    error: &ParseError<I, ErrMode<ContextError>>,
) -> Diagnostic<StringParserDiagnosticCategory, SpanId> {
    let mut diagnostic =
        Diagnostic::new(StringParserDiagnosticCategory::InvalidType, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, Cow::Owned(parse_error_display(error))));

    diagnostic
}

pub(crate) fn expected_callee(span: SpanId) -> Diagnostic<ArrayParserDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(
        ArrayParserDiagnosticCategory::ExpectedCallee,
        Severity::ERROR,
    );

    diagnostic.labels.push(Label::new(span, "Expected callee"));

    diagnostic.help = Some(Help::new(
        "The callee is always the first argument in the array",
    ));

    diagnostic
}

pub(crate) fn duplicate_key(
    span: SpanId,
    duplicate: SpanId,
) -> Diagnostic<ObjectParserDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(
        ObjectParserDiagnosticCategory::DuplicateKey,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(duplicate, "... of this key"));

    diagnostic
        .labels
        .push(Label::new(span, "This is a duplicate").with_order(-1));

    diagnostic
}

pub(crate) fn required_key(
    span: SpanId,
    key: impl AsRef<str>,
) -> Diagnostic<ObjectParserDiagnosticCategory, SpanId> {
    let mut diagnostic =
        Diagnostic::new(ObjectParserDiagnosticCategory::RequiredKey, Severity::ERROR);

    diagnostic.labels.push(Label::new(
        span,
        format!("Requires the key `{}`", key.as_ref()),
    ));

    diagnostic
}
pub(crate) fn unknown_key(
    span: SpanId,
    key: impl AsRef<str>,
    expected: &[&'static str],
) -> Diagnostic<ObjectParserDiagnosticCategory, SpanId> {
    let mut diagnostic =
        Diagnostic::new(ObjectParserDiagnosticCategory::UnknownKey, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, format!("Unknown key `{}`", key.as_ref())));

    let expected = expected
        .iter()
        .enumerate()
        .fold(String::new(), |mut acc, (index, key)| {
            if index != 0 {
                acc.push_str(", ");
            }

            if index == expected.len() - 1 {
                acc.push_str("or ");
            }

            acc.push_str(key);

            acc
        });

    diagnostic.help = Some(Help::new(format!("Expected {expected}")));

    diagnostic
}

pub(crate) fn expected_non_empty_object(
    span: SpanId,
) -> Diagnostic<ObjectParserDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(
        ObjectParserDiagnosticCategory::ExpectedNonEmpty,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Expected a non-empty object"));

    diagnostic
}
