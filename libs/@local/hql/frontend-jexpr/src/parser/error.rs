use std::borrow::Cow;

use hql_diagnostics::{
    category::Category, help::Help, label::Label, rob::RefOrBox, severity::Severity, Diagnostic,
};
use hql_span::SpanId;
use winnow::error::{ContextError, ErrMode, ParseError};

use crate::{
    error::CATEGORY,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
};

pub(crate) const PARSE: &Category = &Category {
    id: Cow::Borrowed("parse"),
    name: Cow::Borrowed("Parsing"),
    parent: Some(RefOrBox::Ref(CATEGORY)),
};

pub(crate) const UNEXPECTED_EOF: &Category = &Category {
    id: Cow::Borrowed("unexpected-eof"),
    name: Cow::Borrowed("Unexpected end of input"),
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

pub(crate) const ARRAY: &Category = &Category {
    id: Cow::Borrowed("array"),
    name: Cow::Borrowed("Array"),
    parent: Some(RefOrBox::Ref(PARSE)),
};

pub(crate) const EXPECTED_CALLEE: &Category = &Category {
    id: Cow::Borrowed("expected-callee"),
    name: Cow::Borrowed("Expected callee"),
    parent: Some(RefOrBox::Ref(ARRAY)),
};

pub(crate) fn unexpected_eof(span: SpanId) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(UNEXPECTED_EOF, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Unexpected end of input"));

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

pub(crate) fn invalid_identifier<I>(
    span: SpanId,
    error: ParseError<I, ErrMode<ContextError>>,
) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(INVALID_IDENTIFIER, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, Cow::Owned(error.inner().to_string())));

    diagnostic
}

pub(crate) fn invalid_signature<I>(
    span: SpanId,
    error: ParseError<I, ErrMode<ContextError>>,
) -> Diagnostic<'static, SpanId> {
    let mut diagnostic = Diagnostic::new(INVALID_SIGNATURE, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, Cow::Owned(error.inner().to_string())));

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
