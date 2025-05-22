use alloc::borrow::Cow;

use hashql_core::span::{SpanId, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};
use winnow::error::{ContextError, ParseError};

use crate::{
    lexer::{error::LexerDiagnosticCategory, syntax_kind::SyntaxKind},
    span::Span,
};

pub(crate) type ObjectDiagnostic = Diagnostic<ObjectDiagnosticCategory, SpanId>;

const LEADING_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "leading-comma",
    name: "Unexpected leading comma in object",
};

const TRAILING_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "trailing-comma",
    name: "Unexpected trailing comma in object",
};

const CONSECUTIVE_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "consecutive-comma",
    name: "Consecutive commas in object",
};

const CONSECUTIVE_COLON: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "consecutive-colon",
    name: "Multiple colons between key and value",
};

const UNKNOWN_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unknown-key",
    name: "Unknown or unsupported object key",
};

const EMPTY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty",
    name: "Empty object not allowed",
};

const ORPHANED_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "orphaned-type",
    name: "Orphaned #type field without parent construct",
};

const DUPLICATE_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-key",
    name: "Duplicate key in object",
};

const STRUCT_EXPECTED_OBJECT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "struct-expected-object",
    name: "Expected object for #struct definition",
};

const STRUCT_KEY_EXPECTED_IDENTIFIER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "struct-key-expected-identifier",
    name: "Expected identifier for struct field key",
};

const DICT_EXPECTED_FORMAT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "dict-expected-format",
    name: "Expected valid dictionary format",
};

const DICT_ENTRY_TOO_FEW_ITEMS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "dict-entry-too-few-items",
    name: "Not enough items in dictionary entry",
};

const DICT_ENTRY_TOO_MANY_ITEMS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "dict-entry-too-many-items",
    name: "Too many items in dictionary entry",
};

const DICT_ENTRY_EXPECTED_ARRAY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "dict-entry-expected-array",
    name: "Expected array for dictionary entry",
};

const TUPLE_EXPECTED_ARRAY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "tuple-expected-array",
    name: "Expected array for #tuple definition",
};

const LIST_EXPECTED_ARRAY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "list-expected-array",
    name: "Expected array for #list definition",
};

const TYPE_EXPECTED_STRING: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-expected-string",
    name: "Expected string for type definition",
};

const LITERAL_EXPECTED_PRIMITIVE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "literal-expected-primitive",
    name: "Expected primitive for literal definition",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ObjectDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    LeadingComma,
    TrailingComma,
    ConsecutiveComma,
    ConsecutiveColon,
    UnknownKey,
    Empty,
    OrphanedType,
    DuplicateKey,
    StructExpectedObject,
    StructKeyExpectedIdentifier,
    DictExpectedFormat,
    DictEntryTooFewItems,
    DictEntryTooManyItems,
    DictEntryExpectedArray,
    TupleExpectedArray,
    ListExpectedArray,
    TypeExpectedString,
    LiteralExpectedPrimitive,
}

impl ObjectDiagnosticCategory {
    pub(crate) fn hoist(&self) -> &dyn DiagnosticCategory {
        match self {
            Self::Lexer(category) => category.subcategory().unwrap_or(category),
            _ => self,
        }
    }
}

impl DiagnosticCategory for ObjectDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.id(),
            _ => Cow::Borrowed("object"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.name(),
            _ => Cow::Borrowed("Object"),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Lexer(lexer) => lexer.subcategory(),
            Self::LeadingComma => Some(&LEADING_COMMA),
            Self::TrailingComma => Some(&TRAILING_COMMA),
            Self::ConsecutiveComma => Some(&CONSECUTIVE_COMMA),
            Self::ConsecutiveColon => Some(&CONSECUTIVE_COLON),
            Self::UnknownKey => Some(&UNKNOWN_KEY),
            Self::Empty => Some(&EMPTY),
            Self::OrphanedType => Some(&ORPHANED_TYPE),
            Self::DuplicateKey => Some(&DUPLICATE_KEY),
            Self::StructExpectedObject => Some(&STRUCT_EXPECTED_OBJECT),
            Self::StructKeyExpectedIdentifier => Some(&STRUCT_KEY_EXPECTED_IDENTIFIER),
            Self::DictExpectedFormat => Some(&DICT_EXPECTED_FORMAT),
            Self::DictEntryExpectedArray => Some(&DICT_ENTRY_EXPECTED_ARRAY),
            Self::DictEntryTooFewItems => Some(&DICT_ENTRY_TOO_FEW_ITEMS),
            Self::DictEntryTooManyItems => Some(&DICT_ENTRY_TOO_MANY_ITEMS),
            Self::TupleExpectedArray => Some(&TUPLE_EXPECTED_ARRAY),
            Self::ListExpectedArray => Some(&LIST_EXPECTED_ARRAY),
            Self::LiteralExpectedPrimitive => Some(&LITERAL_EXPECTED_PRIMITIVE),
            Self::TypeExpectedString => Some(&TYPE_EXPECTED_STRING),
        }
    }
}

impl From<LexerDiagnosticCategory> for ObjectDiagnosticCategory {
    fn from(value: LexerDiagnosticCategory) -> Self {
        Self::Lexer(value)
    }
}

const EMPTY_HELP: &str = r##"J-Expr objects must contain at least one key-value pair with a specific structure. For example: `{"#literal": 42}` or `{"#struct": {"name": {"#literal": "value"}}}`"##;

const EMPTY_NOTE: &str = r##"J-Expr requires objects to have a specific structure represented by one of these constructs:
- `{"#struct": {...}, "#type"?: ...}` - For structured data with named fields
- `{"#dict": {...}, "#type"?: ...}` - For dictionary/map-like data
- `{"#tuple": [...], "#type"?: ...}` - For fixed-size ordered collections
- `{"#list": [...], "#type"?: ...}` - For variable-length ordered collections
- `{"#literal": value}` - For simple scalar values
- `{"#type": "typename"}` - For type declarations

Empty objects don't have semantic meaning in J-Expr.
"##;

pub(crate) fn empty(span: SpanId) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::Empty, Severity::Error);

    diagnostic
        .labels
        .push(Label::new(span, "Add required fields to this object"));

    diagnostic.add_help(Help::new(EMPTY_HELP));
    diagnostic.add_note(Note::new(EMPTY_NOTE));

    diagnostic
}

const TRAILING_COMMA_HELP: &str = r#"J-Expr does not support trailing commas in objects. Use `{"key": value}` instead of `{"key": value,}`"#;

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn trailing_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::TrailingComma, Severity::Error);

    for (index, &span) in spans.iter().rev().enumerate() {
        let message = if index == 0 {
            "Remove this trailing comma"
        } else {
            "... and this trailing comma"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order(index as i32));
    }

    diagnostic.add_help(Help::new(TRAILING_COMMA_HELP));

    diagnostic
}

const LEADING_COMMA_HELP: &str = r#"J-Expr does not support leading commas in objects. Use `{"key1": value1, "key2": value2}` format."#;

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn leading_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::LeadingComma, Severity::Error);

    for (index, &span) in spans.iter().rev().enumerate() {
        let message = if index == 0 {
            "Remove this leading comma"
        } else {
            "... and this leading comma"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order(index as i32));
    }

    diagnostic.add_help(Help::new(LEADING_COMMA_HELP));

    diagnostic
}

const CONSECUTIVE_COMMA_HELP: &str = r#"J-Expr requires exactly one comma between key-value pairs. Use `{"key1": value1, "key2": value2}` format."#;

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn consecutive_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveComma, Severity::Error);

    for (index, &span) in spans.iter().rev().enumerate() {
        let message = if index == 0 {
            "Remove this extra comma"
        } else {
            "... and this extra comma"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order(index as i32));
    }

    diagnostic.add_help(Help::new(CONSECUTIVE_COMMA_HELP));

    diagnostic
}

const CONSECUTIVE_COLON_HELP: &str = r#"J-Expr requires exactly one colon between a key and its value. Use `{"key": value}` format."#;

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn consecutive_colons(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveColon, Severity::Error);

    for (index, &span) in spans.iter().rev().enumerate() {
        let message = if index == 0 {
            "Remove this extra colon"
        } else {
            "... and this extra colon"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order(index as i32));
    }

    diagnostic.add_help(Help::new(CONSECUTIVE_COLON_HELP));

    diagnostic
}

pub(crate) fn unknown_key(
    span: SpanId,
    key: impl AsRef<str>,
    expected: &[&'static str],
) -> Diagnostic<ObjectDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::UnknownKey, Severity::Error);

    diagnostic.labels.push(Label::new(
        span,
        if expected.is_empty() {
            format!("Remove the `{}` key", key.as_ref())
        } else {
            format!("Replace `{}` with a valid key", key.as_ref())
        },
    ));

    let help_message = if expected.is_empty() {
        Cow::Borrowed(
            "No additional keys are allowed in this context. Each J-Expr construct accepts only \
             specific keys (e.g., #literal can only have #type as an additional key).",
        )
    } else {
        let expected = expected
            .iter()
            .enumerate()
            .fold(String::new(), |mut acc, (index, key)| {
                if index != 0 {
                    acc.push_str(", ");
                }

                if index == expected.len() - 1 && expected.len() > 1 {
                    acc.push_str("or ");
                }

                acc.push('`');
                acc.push_str(key);
                acc.push('`');

                acc
            });

        Cow::Owned(format!(
            "This J-Expr object only accepts these specific keys: {expected}"
        ))
    };

    diagnostic.add_help(Help::new(help_message));

    diagnostic
}

pub(crate) fn orphaned_type(span: SpanId) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::OrphanedType, Severity::Error);

    diagnostic.labels.push(Label::new(
        span,
        "Add a primary construct to use with #type",
    ));

    diagnostic.add_help(Help::new(
        "The `#type` field must be used alongside a primary construct like `#struct`, `#list`, \
         etc. It cannot be used alone in an object.",
    ));

    diagnostic.add_note(Note::new(
        r##"The `#type` field is used to annotate the type of a construct. Valid examples include:
    - `{"#struct": {...}, "#type": "Person"}`
    - `{"#list": [...], "#type": "List<Number>"}`
    - `{"#literal": 42, "#type": "Int"}`"##,
    ));

    diagnostic
}

/// Creates a diagnostic for when a key appears multiple times in the same object.
///
/// # Arguments
///
/// * `first_span` - The span of the first occurrence of the key
/// * `duplicate_span` - The span of the duplicate occurrence of the key
/// * `key` - The key that was duplicated
pub(crate) fn duplicate_key(
    first_span: SpanId,
    duplicate_span: SpanId,
    key: impl AsRef<str>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::DuplicateKey, Severity::Error);

    diagnostic
        .labels
        .push(Label::new(duplicate_span, "Duplicate key").with_order(0));

    diagnostic.labels.push(
        Label::new(
            first_span,
            format!("First occurrence of `{}`", key.as_ref()),
        )
        .with_order(1),
    );

    diagnostic.add_help(Help::new(
        "J-Expr does not allow duplicate keys in the same object. Each key must be unique.",
    ));

    diagnostic
}

const STRUCT_KEY_IDENTIFIER_NOTE: &str = "Struct field keys must be valid HashQL identifiers";

pub(crate) fn struct_key_expected_identifier<I>(
    spans: &SpanStorage<Span>,
    key_span: SpanId,
    parse_error: ParseError<I, ContextError>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::StructKeyExpectedIdentifier,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(key_span, "Invalid struct field key"));

    let (_, expected) =
        crate::parser::string::error::convert_parse_error(spans, key_span, parse_error);

    if let Some(expected) = expected {
        diagnostic.add_help(Help::new(expected));
    }

    diagnostic.add_note(Note::new(STRUCT_KEY_IDENTIFIER_NOTE));

    diagnostic
}

pub(crate) fn dict_entry_expected_array(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryExpectedArray,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Expected an array for dictionary entry"));

    let help_message = format!(
        "Found {found}, but dictionary entries must be arrays with exactly two elements [key, \
         value]"
    );
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(
        "In the array-of-pairs format for dictionaries, each entry must be a two-element array.",
    ));

    diagnostic
}

const DICT_ENTRY_FORMAT_NOTE: &str =
    "Dictionary entries must have exactly two elements: a key and a value.";

pub(crate) fn dict_entry_too_few_items(span: SpanId, found: usize) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryTooFewItems,
        Severity::Error,
    );

    let label_text = if found == 0 {
        "Empty dictionary entry"
    } else {
        "Incomplete dictionary entry"
    };

    diagnostic.labels.push(Label::new(span, label_text));

    let help_message = format!("Expected 2 items (key and value), but found only {found}");
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(DICT_ENTRY_FORMAT_NOTE));

    diagnostic
}

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn dict_entry_too_many_items(excess_element_spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictEntryTooManyItems,
        Severity::Error,
    );

    for (idx, &span) in excess_element_spans.iter().enumerate() {
        let message = if idx == 0 {
            "Remove this element"
        } else {
            "... and this element"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order((idx + 1) as i32));
    }

    let help_message = format!(
        "Dictionary entries must contain exactly 2 items (key and value), but found {}",
        2 + excess_element_spans.len()
    );
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(DICT_ENTRY_FORMAT_NOTE));

    diagnostic
}

pub(crate) fn tuple_expected_array(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::TupleExpectedArray,
        Severity::Error,
    );

    // More accurate label for the position
    diagnostic
        .labels
        .push(Label::new(span, "Expected an array here"));

    // More specific help with clear guidance
    let help_message = format!(
        "The #tuple construct requires an array of elements, but found {found}. Use square \
         brackets to define the tuple elements: [element1, element2, ...]"
    );
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(
        "Tuples in J-Expr represent fixed-size ordered collections where each position can have a \
         different type.",
    ));

    diagnostic
}

pub(crate) fn list_expected_array(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ListExpectedArray, Severity::Error);

    // More accurate label for the position
    diagnostic
        .labels
        .push(Label::new(span, "Expected an array here"));

    // More specific help with clear guidance
    let help_message = format!(
        "The #list construct requires an array of elements, but found {found}. Use square \
         brackets to define the list elements: [element1, element2, ...]"
    );
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(
        "Lists in J-Expr represent variable-length collections where all elements must have the \
         same type.",
    ));

    diagnostic
}

pub(crate) fn struct_expected_object(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::StructExpectedObject,
        Severity::Error,
    );

    // More accurate label for the position
    diagnostic
        .labels
        .push(Label::new(span, "Expected an object here"));

    // More specific help with clear guidance
    let help_message = format!(
        "The #struct construct requires an object with field definitions, but found {found}. Use \
         curly braces to define the struct fields: {{\"field1\": value1, \"field2\": value2}}"
    );
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(
        "Structs in J-Expr represent collections of named fields, where each field can have a \
         different type.",
    ));

    diagnostic
}

pub(crate) fn dict_expected_format(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::DictExpectedFormat,
        Severity::Error,
    );

    // More accurate label for the position
    diagnostic.labels.push(Label::new(
        span,
        "Expected an object or array of pairs here",
    ));

    // More specific help with clear guidance
    let help_message = format!(
        "Found {found}, but the #dict construct requires either an object {{key: value, ...}} or \
         an array of pairs [[key, value], ...]"
    );
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(
        r#"Valid dictionary formats:
    1. Object syntax: {"key1": value1, "key2": value2, ...}
    2. Array of pairs: [[key1, value1], [key2, value2], ...]"#,
    ));

    diagnostic
}

pub(crate) fn type_expected_string(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::TypeExpectedString,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Invalid type specification"));

    diagnostic.add_help(Help::new(format!(
        "Found {found}, which is not a valid type specification. Types must be represented as a \
         string.",
    )));

    diagnostic.add_note(Note::new(
        "Types in J-Expr must be specified through an embedded language represented in a string \
         that mimics that of Rust and TypeScript. See the language documentation for more details.",
    ));

    diagnostic
}

pub(crate) fn literal_expected_primitive(span: SpanId, found: SyntaxKind) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::LiteralExpectedPrimitive,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Invalid literal value in this context"));

    let help_message = format!(
        "Found {found}, which is not a valid primitive literal. Primitive literals are either \
         strings, numbers, or booleans."
    );
    diagnostic.add_help(Help::new(help_message));

    diagnostic
}
