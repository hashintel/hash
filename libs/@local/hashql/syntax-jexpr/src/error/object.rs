//! Object-level diagnostic categories and structural object diagnostic builders.

use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Critical,
};

use super::lexer::LexerDiagnosticCategory;

pub(crate) type ObjectDiagnostic<K = Critical> = Diagnostic<ObjectDiagnosticCategory, SpanId, K>;

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

/// Diagnostic categories produced while parsing objects and data constructors.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ObjectDiagnosticCategory {
    /// Token-level error inside an object context.
    Lexer(LexerDiagnosticCategory),
    /// Comma appearing before the first object field.
    LeadingComma,
    /// Comma appearing after the last object field before `}`.
    TrailingComma,
    /// Adjacent commas without an intervening field.
    ConsecutiveComma,
    /// Adjacent colons between a field key and value.
    ConsecutiveColon,
    /// Object key not accepted by the enclosing J-Expr constructor.
    UnknownKey,
    /// Empty `{}` constructor object.
    Empty,
    /// `#type` field without a primary constructor field in the same object.
    OrphanedType,
    /// Constructor or `#type` key repeated in the same object.
    DuplicateKey,
    /// Non-object value supplied to `#struct`.
    StructExpectedObject,
    /// Struct field key that is not a valid HashQL identifier.
    StructKeyExpectedIdentifier,
    /// Value supplied to `#dict` that is neither an object nor an array of pairs.
    DictExpectedFormat,
    /// Pair entry in an array-form `#dict` with fewer than two elements.
    DictEntryTooFewItems,
    /// Pair entry in an array-form `#dict` with more than two elements.
    DictEntryTooManyItems,
    /// Non-array entry in an array-form `#dict`.
    DictEntryExpectedArray,
    /// Non-array value supplied to `#tuple`.
    TupleExpectedArray,
    /// Non-array value supplied to `#list`.
    ListExpectedArray,
    /// Non-string value supplied to `#type`.
    TypeExpectedString,
    /// Non-primitive value supplied to `#literal`.
    LiteralExpectedPrimitive,
}

impl ObjectDiagnosticCategory {
    pub(crate) fn hoist(&self) -> &dyn DiagnosticCategory {
        match self {
            Self::Lexer(category) => category.subcategory().unwrap_or(category),
            Self::LeadingComma
            | Self::TrailingComma
            | Self::ConsecutiveComma
            | Self::ConsecutiveColon
            | Self::UnknownKey
            | Self::Empty
            | Self::OrphanedType
            | Self::DuplicateKey
            | Self::StructExpectedObject
            | Self::StructKeyExpectedIdentifier
            | Self::DictExpectedFormat
            | Self::DictEntryTooFewItems
            | Self::DictEntryTooManyItems
            | Self::DictEntryExpectedArray
            | Self::TupleExpectedArray
            | Self::ListExpectedArray
            | Self::TypeExpectedString
            | Self::LiteralExpectedPrimitive => self,
        }
    }
}

impl DiagnosticCategory for ObjectDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.id(),
            Self::LeadingComma
            | Self::TrailingComma
            | Self::ConsecutiveComma
            | Self::ConsecutiveColon
            | Self::UnknownKey
            | Self::Empty
            | Self::OrphanedType
            | Self::DuplicateKey
            | Self::StructExpectedObject
            | Self::StructKeyExpectedIdentifier
            | Self::DictExpectedFormat
            | Self::DictEntryTooFewItems
            | Self::DictEntryTooManyItems
            | Self::DictEntryExpectedArray
            | Self::TupleExpectedArray
            | Self::ListExpectedArray
            | Self::TypeExpectedString
            | Self::LiteralExpectedPrimitive => Cow::Borrowed("object"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.name(),
            Self::LeadingComma
            | Self::TrailingComma
            | Self::ConsecutiveComma
            | Self::ConsecutiveColon
            | Self::UnknownKey
            | Self::Empty
            | Self::OrphanedType
            | Self::DuplicateKey
            | Self::StructExpectedObject
            | Self::StructKeyExpectedIdentifier
            | Self::DictExpectedFormat
            | Self::DictEntryTooFewItems
            | Self::DictEntryTooManyItems
            | Self::DictEntryExpectedArray
            | Self::TupleExpectedArray
            | Self::ListExpectedArray
            | Self::TypeExpectedString
            | Self::LiteralExpectedPrimitive => Cow::Borrowed("Object"),
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
    #[inline]
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
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::Empty, Critical::ERROR)
        .primary(Label::new(span, "Add required fields to this object"));
    diagnostic.add_message(Message::help(EMPTY_HELP));
    diagnostic.add_message(Message::note(EMPTY_NOTE));
    diagnostic
}

const TRAILING_COMMA_HELP: &str = r#"J-Expr does not support trailing commas in objects. Use `{"key": value}` instead of `{"key": value,}`"#;

pub(crate) fn trailing_commas(first: SpanId, rest: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::TrailingComma, Critical::ERROR)
        .primary(Label::new(first, "Remove this trailing comma"));
    for &span in rest {
        diagnostic
            .labels
            .push(Label::new(span, "... and this trailing comma"));
    }
    diagnostic.add_message(Message::help(TRAILING_COMMA_HELP));
    diagnostic
}

const LEADING_COMMA_HELP: &str = r#"J-Expr does not support leading commas in objects. Use `{"key1": value1, "key2": value2}` format."#;

pub(crate) fn leading_commas(first: SpanId, rest: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::LeadingComma, Critical::ERROR)
        .primary(Label::new(first, "Remove this leading comma"));
    for &span in rest {
        diagnostic
            .labels
            .push(Label::new(span, "... and this leading comma"));
    }
    diagnostic.add_message(Message::help(LEADING_COMMA_HELP));
    diagnostic
}

const CONSECUTIVE_COMMA_HELP: &str = r#"J-Expr requires exactly one comma between key-value pairs. Use `{"key1": value1, "key2": value2}` format."#;

pub(crate) fn consecutive_commas(first: SpanId, rest: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveComma, Critical::ERROR)
            .primary(Label::new(first, "Remove this extra comma"));
    for &span in rest {
        diagnostic
            .labels
            .push(Label::new(span, "... and this extra comma"));
    }
    diagnostic.add_message(Message::help(CONSECUTIVE_COMMA_HELP));
    diagnostic
}

const CONSECUTIVE_COLON_HELP: &str = r#"J-Expr requires exactly one colon between a key and its value. Use `{"key": value}` format."#;

pub(crate) fn consecutive_colons(first: SpanId, rest: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveColon, Critical::ERROR)
            .primary(Label::new(first, "Remove this extra colon"));
    for &span in rest {
        diagnostic
            .labels
            .push(Label::new(span, "... and this extra colon"));
    }
    diagnostic.add_message(Message::help(CONSECUTIVE_COLON_HELP));
    diagnostic
}

pub(crate) fn unknown_key(span: SpanId, key: &str, expected: &[&'static str]) -> ObjectDiagnostic {
    // Labels are not escaped by annotate-snippets, so escape control characters in user keys.
    let key = key.escape_debug();

    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::UnknownKey, Critical::ERROR)
        .primary(Label::new(
            span,
            if expected.is_empty() {
                format!("Remove the `{key}` key")
            } else {
                format!("Replace `{key}` with a valid key")
            },
        ));

    let help_message = if expected.is_empty() {
        Cow::Borrowed(
            "No additional keys are allowed in this context. Each J-Expr construct accepts only \
             specific keys (e.g., #literal can only have #type as an additional key).",
        )
    } else {
        let mut list = String::new();
        for (index, item) in expected.iter().enumerate() {
            if index != 0 {
                list.push_str(", ");
            }
            if index == expected.len() - 1 && expected.len() > 1 {
                list.push_str("or ");
            }
            list.push('`');
            list.push_str(item);
            list.push('`');
        }
        Cow::Owned(format!(
            "This J-Expr object only accepts these specific keys: {list}"
        ))
    };

    diagnostic.add_message(Message::help(help_message));
    diagnostic
}

pub(crate) fn orphaned_type(span: SpanId) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::OrphanedType, Critical::ERROR).primary(
            Label::new(span, "Add a primary construct to use with #type"),
        );

    diagnostic.add_message(Message::help(
        "The `#type` field must be used alongside a primary construct like `#struct`, `#list`, \
         etc. It cannot be used alone in an object.",
    ));

    diagnostic.add_message(Message::note(
        r##"The `#type` field is used to annotate the type of a construct. Valid examples include:
    - `{"#struct": {...}, "#type": "Person"}`
    - `{"#list": [...], "#type": "List<Number>"}`
    - `{"#literal": 42, "#type": "Int"}`"##,
    ));

    diagnostic
}

pub(crate) fn duplicate_key(
    first_span: SpanId,
    duplicate_span: SpanId,
    key: &str,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::DuplicateKey, Critical::ERROR)
        .primary(Label::new(duplicate_span, "Duplicate key"));
    diagnostic.labels.push(Label::new(
        first_span,
        format!("First occurrence of `{key}`"),
    ));
    diagnostic.add_message(Message::help(
        "J-Expr does not allow duplicate keys in the same object. Each key must be unique.",
    ));
    diagnostic
}
