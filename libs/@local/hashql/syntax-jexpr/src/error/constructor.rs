use hashql_core::span::{SpanId, SpanTable};
use hashql_diagnostics::{Diagnostic, Label, diagnostic::Message, severity::Critical};
use winnow::error::ContextError;

use super::object::{ObjectDiagnostic, ObjectDiagnosticCategory};
use crate::{embedded::error::convert_parse_error, span::Span, syntax_kind::SyntaxKind};

const STRUCT_KEY_IDENTIFIER_NOTE: &str = "Struct field keys must be valid HashQL identifiers";

pub(crate) fn struct_key_expected_identifier(
    spans: &mut SpanTable<Span>,
    key_span: SpanId,
    parse_error: (usize, ContextError),
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::StructKeyExpectedIdentifier,
        Critical::ERROR,
    )
    .primary(Label::new(key_span, "Invalid struct field key"));

    let (_, expected) = convert_parse_error(spans, key_span, parse_error);
    if let Some(expected) = expected {
        diagnostic.add_message(Message::help(expected));
    }
    diagnostic.add_message(Message::note(STRUCT_KEY_IDENTIFIER_NOTE));
    diagnostic
}

pub(crate) fn dict_entry_expected_array(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryExpectedArray,
        Critical::ERROR,
    )
    .primary(Label::new(span, "Expected an array for dictionary entry"));

    diagnostic.add_message(Message::help(format!(
        "Found {found}, but dictionary entries must be arrays with exactly two elements [key, \
         value]"
    )));
    diagnostic.add_message(Message::note(
        "In the array-of-pairs format for dictionaries, each entry must be a two-element array.",
    ));
    diagnostic
}

const DICT_ENTRY_FORMAT_NOTE: &str =
    "Dictionary entries must have exactly two elements: a key and a value.";

pub(crate) fn dict_entry_too_few_items(span: SpanId, found: usize) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryTooFewItems,
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        if found == 0 {
            "Empty dictionary entry"
        } else {
            "Incomplete dictionary entry"
        },
    ));
    diagnostic.add_message(Message::help(format!(
        "Expected 2 items (key and value), but found only {found}"
    )));
    diagnostic.add_message(Message::note(DICT_ENTRY_FORMAT_NOTE));
    diagnostic
}

pub(crate) fn dict_entry_too_many_items(first: SpanId, rest: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryTooManyItems,
        Critical::ERROR,
    )
    .primary(Label::new(first, "Remove this element"));
    for &span in rest {
        diagnostic
            .labels
            .push(Label::new(span, "... and this element"));
    }
    diagnostic.add_message(Message::help(format!(
        "Dictionary entries must contain exactly 2 items (key and value), but found {}",
        3 + rest.len()
    )));
    diagnostic.add_message(Message::note(DICT_ENTRY_FORMAT_NOTE));
    diagnostic
}

pub(crate) fn tuple_expected_array(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::TupleExpectedArray,
        Critical::ERROR,
    )
    .primary(Label::new(span, "Expected an array here"));
    diagnostic.add_message(Message::help(format!(
        "The #tuple construct requires an array of elements, but found {found}. Use square \
         brackets to define the tuple elements: [element1, element2, ...]"
    )));
    diagnostic.add_message(Message::note(
        "Tuples in J-Expr represent fixed-size ordered collections where each position can have a \
         different type.",
    ));
    diagnostic
}

pub(crate) fn list_expected_array(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ListExpectedArray, Critical::ERROR)
            .primary(Label::new(span, "Expected an array here"));
    diagnostic.add_message(Message::help(format!(
        "The #list construct requires an array of elements, but found {found}. Use square \
         brackets to define the list elements: [element1, element2, ...]"
    )));
    diagnostic.add_message(Message::note(
        "Lists in J-Expr represent variable-length collections where all elements must have the \
         same type.",
    ));
    diagnostic
}

pub(crate) fn struct_expected_object(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::StructExpectedObject,
        Critical::ERROR,
    )
    .primary(Label::new(span, "Expected an object here"));
    diagnostic.add_message(Message::help(format!(
        "The #struct construct requires an object with field definitions, but found {found}. Use \
         curly braces to define the struct fields: {{\"field1\": value1, \"field2\": value2}}"
    )));
    diagnostic.add_message(Message::note(
        "Structs in J-Expr represent collections of named fields, where each field can have a \
         different type.",
    ));
    diagnostic
}

pub(crate) fn dict_expected_format(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictExpectedFormat,
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        "Expected an object or array of pairs here",
    ));
    diagnostic.add_message(Message::help(format!(
        "Found {found}, but the #dict construct requires either an object {{key: value, ...}} or \
         an array of pairs [[key, value], ...]"
    )));
    diagnostic.add_message(Message::note(
        r#"Valid dictionary formats:
    1. Object syntax: {"key1": value1, "key2": value2, ...}
    2. Array of pairs: [[key1, value1], [key2, value2], ...]"#,
    ));
    diagnostic
}

pub(crate) fn type_expected_string(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::TypeExpectedString,
        Critical::ERROR,
    )
    .primary(Label::new(span, "Invalid type specification"));
    diagnostic.add_message(Message::help(format!(
        "Found {found}, which is not a valid type specification. Types must be represented as a \
         string.",
    )));
    diagnostic.add_message(Message::note(
        "Types in J-Expr must be specified through an embedded language represented in a string \
         that mimics that of Rust and TypeScript. See the language documentation for more details.",
    ));
    diagnostic
}

pub(crate) fn literal_expected_primitive(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::LiteralExpectedPrimitive,
        Critical::ERROR,
    )
    .primary(Label::new(span, "Invalid literal value in this context"));
    diagnostic.add_message(Message::help(format!(
        "Found {found}, which is not a valid primitive literal. Primitive literals are either \
         strings, numbers, or booleans."
    )));
    diagnostic
}
