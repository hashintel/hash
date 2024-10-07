use alloc::borrow::Cow;

use hql_diagnostics::{
    Diagnostic, category::Category, help::Help, label::Label, rob::RefOrBox, severity::Severity,
};
use hql_span::SpanId;
use winnow::error::{ContextError, ErrMode, ParseError};

use crate::{
    error::JEXPR_CATEGORY,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
};

pub(crate) const PARSE: &Category = &Category {
    id: Cow::Borrowed("parse"),
    name: Cow::Borrowed("Parsing"),
    parent: Some(RefOrBox::Ref(JEXPR_CATEGORY)),
};

pub(crate) const UNEXPECTED_EOF: &Category = &Category {
    id: Cow::Borrowed("unexpected-eof"),
    name: Cow::Borrowed("Unexpected end of input"),
    parent: Some(RefOrBox::Ref(PARSE)),
};

pub(crate) const EXPECTED_EOF: &Category = &Category {
    id: Cow::Borrowed("expected-eof"),
    name: Cow::Borrowed("Expected end of input"),
    parent: Some(RefOrBox::Ref(PARSE)),
};

pub(crate) const UNEXPECTED_TOKEN: &Category = &Category {
    id: Cow::Borrowed("unexpected-token"),
    name: Cow::Borrowed("Unexpected token"),
    parent: Some(RefOrBox::Ref(PARSE)),
};

pub(crate) const STRING: &Category = &Category {
    id: Cow::Borrowed("string"),
    name: Cow::Borrowed("String"),
    parent: Some(RefOrBox::Ref(PARSE)),
};

pub(crate) const INVALID_IDENTIFIER: &Category = &Category {
    id: Cow::Borrowed("invalid-identifier"),
    name: Cow::Borrowed("Invalid Identifier"),
    parent: Some(RefOrBox::Ref(STRING)),
};

pub(crate) const INVALID_SIGNATURE: &Category = &Category {
    id: Cow::Borrowed("invalid-signature"),
    name: Cow::Borrowed("Invalid Signature"),
    parent: Some(RefOrBox::Ref(STRING)),
};

pub(crate) const INVALID_TYPE: &Category = &Category {
    id: Cow::Borrowed("invalid-type"),
    name: Cow::Borrowed("Invalid Type"),
    parent: Some(RefOrBox::Ref(STRING)),
};

pub(crate) const ARRAY: &Category = &Category {
    id: Cow::Borrowed("array"),
    name: Cow::Borrowed("Array"),
    parent: Some(RefOrBox::Ref(PARSE)),
};

pub(crate) const EXPECTED_CALLEE: &Category = &Category {
    id: Cow::Borrowed("expected-callee"),
    name: Cow::Borrowed("Expected Callee"),
    parent: Some(RefOrBox::Ref(ARRAY)),
};

pub(crate) const OBJECT: &Category = &Category {
    id: Cow::Borrowed("object"),
    name: Cow::Borrowed("Object"),
    parent: Some(RefOrBox::Ref(PARSE)),
};

pub(crate) const DUPLICATE_KEY: &Category = &Category {
    id: Cow::Borrowed("duplicate-key"),
    name: Cow::Borrowed("Duplicate Key"),
    parent: Some(RefOrBox::Ref(OBJECT)),
};

pub(crate) const REQUIRED_KEY: &Category = &Category {
    id: Cow::Borrowed("required-key"),
    name: Cow::Borrowed("Required Key"),
    parent: Some(RefOrBox::Ref(OBJECT)),
};

pub(crate) const UNKNOWN_KEY: &Category = &Category {
    id: Cow::Borrowed("unknown-key"),
    name: Cow::Borrowed("Unknown Key"),
    parent: Some(RefOrBox::Ref(OBJECT)),
};

pub(crate) const EXPECTED_NON_EMPTY_OBJECT: &Category = &Category {
    id: Cow::Borrowed("expected-non-empty"),
    name: Cow::Borrowed("Expected Non-Empty"),
    parent: Some(RefOrBox::Ref(OBJECT)),
};

pub(crate) fn unexpected_eof(span: SpanId) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(UNEXPECTED_EOF, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Unexpected end of input"));

    diagnostic
}

pub(crate) fn expected_eof(span: SpanId) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(EXPECTED_EOF, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Expected end of input"));

    diagnostic
}

pub(crate) fn unexpected_token(
    span: SpanId,
    expected: impl IntoIterator<Item = SyntaxKind>,
) -> Diagnostic<'static, SpanId> {
    let expected = SyntaxKindSet::from_iter(expected);

    let mut diagnostic = Diagnostic::new(UNEXPECTED_TOKEN, Severity::ERROR);

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
) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(INVALID_IDENTIFIER, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, Cow::Owned(parse_error_display(error))));

    diagnostic
}

pub(crate) fn invalid_signature<I>(
    span: SpanId,
    error: &ParseError<I, ErrMode<ContextError>>,
) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(INVALID_SIGNATURE, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, Cow::Owned(parse_error_display(error))));

    diagnostic
}

pub(crate) fn invalid_type<I>(
    span: SpanId,
    error: &ParseError<I, ErrMode<ContextError>>,
) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(INVALID_TYPE, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, Cow::Owned(parse_error_display(error))));

    diagnostic
}

pub(crate) fn expected_callee(span: SpanId) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(EXPECTED_CALLEE, Severity::ERROR);

    diagnostic.labels.push(Label::new(span, "Expected callee"));

    diagnostic.help = Some(Help::new(
        "The callee is always the first argument in the array",
    ));

    diagnostic
}

pub(crate) fn duplicate_key(span: SpanId, duplicate: SpanId) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(DUPLICATE_KEY, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(duplicate, "... of this key"));

    diagnostic
        .labels
        .push(Label::new(span, "This is a duplicate").with_order(-1));

    diagnostic
}

pub(crate) fn required_key(span: SpanId, key: impl AsRef<str>) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(REQUIRED_KEY, Severity::ERROR);

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
) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(UNKNOWN_KEY, Severity::ERROR);

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

pub(crate) fn expected_non_empty_object(span: SpanId) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(EXPECTED_NON_EMPTY_OBJECT, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Expected a non-empty object"));

    diagnostic
}
