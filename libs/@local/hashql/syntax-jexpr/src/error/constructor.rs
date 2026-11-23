use core::alloc::Allocator;

use hashql_core::span::{SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic, Label, Patch, Suggestions, diagnostic::Message, severity::Critical,
};
use winnow::error::ContextError;

use super::{
    ValueKind,
    object::{ObjectDiagnostic, ObjectDiagnosticCategory},
};
use crate::{
    embedded::error::{ParseErrorSource, convert_parse_error_in},
    span::Span,
};

const MAX_EXTRA_LABELS: usize = 2;
const STRUCT_KEY_IDENTIFIER_NOTE: &str = "struct field keys must be valid HashQL identifiers";
const DICT_ENTRY_FORMAT_NOTE: &str =
    "in array-of-pairs format, each `#dict` entry must be a two-element array `[key, value]`";

pub(crate) fn struct_key_expected_identifier_in<A: Allocator>(
    spans: &mut SpanTable<Span>,
    key_span: SpanId,
    raw_quoted: &str,
    decoded: &str,
    parse_error: (usize, ContextError),
    alloc: A,
) -> ObjectDiagnostic {
    if decoded.is_empty() {
        let mut diagnostic = Diagnostic::new(
            ObjectDiagnosticCategory::StructKeyExpectedIdentifier,
            Critical::ERROR,
        )
        .primary(Label::new(key_span, "struct field key cannot be empty"));
        diagnostic.add_message(Message::help(
            "provide a valid HashQL identifier for the struct field name",
        ));
        diagnostic.add_message(Message::note(STRUCT_KEY_IDENTIFIER_NOTE));
        return diagnostic;
    }

    let parts = convert_parse_error_in(
        spans,
        key_span,
        ParseErrorSource {
            raw_quoted,
            decoded,
            kind_name: "struct field identifier",
            start_offset: 0,
        },
        parse_error,
        alloc,
    );

    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::StructKeyExpectedIdentifier,
        Critical::ERROR,
    )
    .primary(Label::new(parts.span, parts.label));

    if let Some(delim) = parts.closing_delimiter {
        let suggestion = Suggestions::patch(Patch::new(parts.span, delim.to_string()));
        diagnostic.add_message(
            Message::help(format!("add the missing `{delim}`")).with_suggestions(suggestion),
        );
    } else {
        diagnostic.add_message(Message::help(
            "use a valid HashQL identifier starting with a letter, `_`, or symbol",
        ));
    }
    diagnostic.add_message(Message::note(STRUCT_KEY_IDENTIFIER_NOTE));
    diagnostic
}

fn expected_value_label(expected: &str, ctor: &str, found: Option<ValueKind>) -> String {
    found.map_or_else(
        || format!("missing value for `{ctor}`; expected {expected}"),
        |kind| format!("expected {expected}, found {}", kind.article_phrase()),
    )
}

pub(crate) fn struct_expected_object(
    span: SpanId,
    key_span: SpanId,
    found: Option<ValueKind>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::StructExpectedObject,
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        expected_value_label("an object", "#struct", found),
    ));
    diagnostic.add_label(Label::new(key_span, "required by `#struct`"));
    diagnostic.add_message(Message::help(
        r##"use an object of field definitions, for example `{"#struct": {"field": value}}`"##,
    ));
    diagnostic
}

pub(crate) fn tuple_expected_array(
    span: SpanId,
    key_span: SpanId,
    found: Option<ValueKind>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::TupleExpectedArray,
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        expected_value_label("an array", "#tuple", found),
    ));
    diagnostic.add_label(Label::new(key_span, "required by `#tuple`"));
    diagnostic.add_message(Message::help(
        r##"use an array of elements, for example `{"#tuple": [elem1, elem2]}`"##,
    ));
    diagnostic
}

pub(crate) fn list_expected_array(
    span: SpanId,
    key_span: SpanId,
    found: Option<ValueKind>,
) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ListExpectedArray, Critical::ERROR).primary(
            Label::new(span, expected_value_label("an array", "#list", found)),
        );
    diagnostic.add_label(Label::new(key_span, "required by `#list`"));
    diagnostic.add_message(Message::help(
        r##"use an array of elements, for example `{"#list": [elem1, elem2]}`"##,
    ));
    diagnostic
}

pub(crate) fn dict_expected_format(
    span: SpanId,
    key_span: SpanId,
    found: Option<ValueKind>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictExpectedFormat,
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        expected_value_label(
            "an object or an array of `[key, value]` pairs",
            "#dict",
            found,
        ),
    ));
    diagnostic.add_label(Label::new(key_span, "required by `#dict`"));
    diagnostic.add_message(Message::help(
        r#"use an object `{"key": value}` or an array of pairs `[[key, value]]`"#,
    ));
    diagnostic
}

pub(crate) fn dict_entry_expected_array(
    span: SpanId,
    dict_key_span: SpanId,
    found: Option<ValueKind>,
) -> ObjectDiagnostic {
    let label = found.map_or_else(
        || "expected a `[key, value]` array for dictionary entry".to_owned(),
        |kind| {
            format!(
                "expected a `[key, value]` array, found {}",
                kind.article_phrase()
            )
        },
    );
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryExpectedArray,
        Critical::ERROR,
    )
    .primary(Label::new(span, label));
    diagnostic.add_label(Label::new(dict_key_span, "in this `#dict` array"));
    diagnostic.add_message(Message::help(
        "write each entry as a two-element array `[key, value]`",
    ));
    diagnostic.add_message(Message::note(DICT_ENTRY_FORMAT_NOTE));
    diagnostic
}

pub(crate) fn dict_entry_too_few_items(
    span: SpanId,
    dict_key_span: SpanId,
    found: usize,
) -> ObjectDiagnostic {
    let (label, help) = if found == 0 {
        (
            "empty dictionary entry; expected `[key, value]`",
            "add a key and value expression: `[key, value]`",
        )
    } else {
        (
            "dictionary entry is missing a value; expected `[key, value]`",
            "add a value expression after the key: `[key, value]`",
        )
    };

    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryTooFewItems,
        Critical::ERROR,
    )
    .primary(Label::new(span, label));
    diagnostic.add_label(Label::new(dict_key_span, "in this `#dict`"));
    diagnostic.add_message(Message::help(help));
    diagnostic.add_message(Message::note(DICT_ENTRY_FORMAT_NOTE));
    diagnostic
}

pub(crate) fn dict_entry_too_many_items(
    first: SpanId,
    dict_key_span: SpanId,
    rest: impl IntoIterator<Item = SpanId, IntoIter: ExactSizeIterator>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryTooManyItems,
        Critical::ERROR,
    )
    .primary(Label::new(
        first,
        "unexpected extra element in dictionary entry",
    ));

    let rest = rest.into_iter();
    let rest_len = rest.len();

    for span in rest.take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(span, "additional extra element"));
    }
    diagnostic.add_label(Label::new(dict_key_span, "in this `#dict`"));

    let total = 3 + rest_len;
    let noun = if rest_len == 0 {
        "the extra element"
    } else {
        "the extra elements"
    };
    diagnostic.add_message(Message::help(format!(
        "remove {noun}; expected 2 elements (`[key, value]`), found {total}"
    )));
    diagnostic.add_message(Message::note(DICT_ENTRY_FORMAT_NOTE));
    diagnostic
}

pub(crate) fn type_expected_string(
    span: SpanId,
    key_span: SpanId,
    found: Option<ValueKind>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::TypeExpectedString,
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        expected_value_label("a string", "#type", found),
    ));
    diagnostic.add_label(Label::new(key_span, "required by `#type`"));
    diagnostic.add_message(Message::help(
        r##"write the type annotation as a string, for example `"#type": "Int"`"##,
    ));
    diagnostic
}

pub(crate) fn literal_expected_primitive(
    span: SpanId,
    key_span: SpanId,
    found: Option<ValueKind>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::LiteralExpectedPrimitive,
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        expected_value_label("a primitive literal", "#literal", found),
    ));
    diagnostic.add_label(Label::new(key_span, "required by `#literal`"));

    let help = match found {
        Some(ValueKind::Array) => {
            r##"use `{"#list": [...]}` or `{"#tuple": [...]}` for collections"##
        }
        Some(ValueKind::Object) => {
            r##"use `{"#struct": {...}}` or `{"#dict": {...}}` for structured data"##
        }
        _ => "provide a string, number, boolean, or `null` value",
    };
    diagnostic.add_message(Message::help(help));
    diagnostic.add_message(Message::note(
        "`#literal` only accepts primitive JSON values: strings, numbers, booleans, or `null`",
    ));
    diagnostic
}
