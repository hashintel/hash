use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

use crate::lexer::error::LexerDiagnosticCategory;

pub(crate) type ObjectDiagnostic = Diagnostic<ObjectDiagnosticCategory, SpanId>;

// Terminal category definitions
const EXPECTED_SEPARATOR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-separator",
    name: "Expected object separator (comma) or closing brace",
};

const EXPECTED_COLON: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-colon",
    name: "Expected colon after object key",
};

const EXPECTED_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-key",
    name: "Expected object key",
};

const EXPECTED_VALUE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-value",
    name: "Expected value after colon",
};

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

const INVALID_LITERAL: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-literal",
    name: "Invalid literal in object context",
};

const INVALID_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-type",
    name: "Invalid type specification",
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ObjectDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    ExpectedSeparator,
    ExpectedColon,
    ExpectedKey,
    ExpectedValue,
    LeadingComma,
    TrailingComma,
    ConsecutiveComma,
    ConsecutiveColon,
    InvalidLiteral,
    InvalidType,
    UnknownKey,
    Empty,
    OrphanedType,
    DuplicateKey,
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
            Self::Lexer(lexer) => Some(lexer),
            Self::ExpectedColon => Some(&EXPECTED_COLON),
            Self::ExpectedSeparator => Some(&EXPECTED_SEPARATOR),
            Self::ExpectedKey => Some(&EXPECTED_KEY),
            Self::ExpectedValue => Some(&EXPECTED_VALUE),
            Self::LeadingComma => Some(&LEADING_COMMA),
            Self::TrailingComma => Some(&TRAILING_COMMA),
            Self::ConsecutiveComma => Some(&CONSECUTIVE_COMMA),
            Self::ConsecutiveColon => Some(&CONSECUTIVE_COLON),
            Self::InvalidLiteral => Some(&INVALID_LITERAL),
            Self::InvalidType => Some(&INVALID_TYPE),
            Self::UnknownKey => Some(&UNKNOWN_KEY),
            Self::Empty => Some(&EMPTY),
            Self::OrphanedType => Some(&ORPHANED_TYPE),
            Self::DuplicateKey => Some(&DUPLICATE_KEY),
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
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::Empty, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Empty object not allowed"));

    diagnostic.help = Some(Help::new(EMPTY_HELP));
    diagnostic.note = Some(Note::new(EMPTY_NOTE));

    diagnostic
}

const TRAILING_COMMA_HELP: &str = r#"J-Expr does not support trailing commas in objects. Use `{"key": value}` instead of `{"key": value,}`"#;

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn trailing_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::TrailingComma, Severity::ERROR);

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

    diagnostic.help = Some(Help::new(TRAILING_COMMA_HELP));

    diagnostic
}

const LEADING_COMMA_HELP: &str = r#"J-Expr does not support leading commas in objects. Use `{"key1": value1, "key2": value2}` format."#;

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn leading_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::LeadingComma, Severity::ERROR);

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

    diagnostic.help = Some(Help::new(LEADING_COMMA_HELP));

    diagnostic
}

const CONSECUTIVE_COMMA_HELP: &str = r#"J-Expr requires exactly one comma between key-value pairs. Use `{"key1": value1, "key2": value2}` format."#;

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn consecutive_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveComma, Severity::ERROR);

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

    diagnostic.help = Some(Help::new(CONSECUTIVE_COMMA_HELP));

    diagnostic
}

const CONSECUTIVE_COLON_HELP: &str = r#"J-Expr requires exactly one colon between a key and its value. Use `{"key": value}` format."#;

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn consecutive_colons(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveColon, Severity::ERROR);

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

    diagnostic.help = Some(Help::new(CONSECUTIVE_COLON_HELP));

    diagnostic
}

const UNKNOWN_KEY_HELP: &str = "J-Expr objects must use specific predefined keys like `#struct`, \
                                `#list`, `#literal`, etc. depending on the context. Check the \
                                documentation for valid constructs in this position.";

pub(crate) fn unknown_key(
    span: SpanId,
    key: impl AsRef<str>,
    expected: &[&'static str],
) -> Diagnostic<ObjectDiagnosticCategory, SpanId> {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::UnknownKey, Severity::ERROR);

    diagnostic.labels.push(Label::new(
        span,
        format!("Unrecognized key `{}`", key.as_ref()),
    ));

    let help_message = if expected.is_empty() {
        Cow::Borrowed("This object doesn't support any custom keys in this context")
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

        Cow::Owned(format!("Replace with one of these valid keys: {expected}"))
    };

    diagnostic.help = Some(Help::new(help_message));

    // Add a note with additional context for the empty expected keys case
    if expected.is_empty() {
        diagnostic.note = Some(Note::new(UNKNOWN_KEY_HELP));
    }

    diagnostic
}

const ORPHANED_TYPE_HELP: &str = "The `#type` field must be used alongside a primary construct \
                                  like `#struct`, `#list`, etc. It cannot be used alone in an \
                                  object.";

const ORPHANED_TYPE_NOTE: &str = r##"The `#type` field is used to annotate the type of a construct. Valid examples include:
- `{"#struct": {...}, "#type": "Person"}`
- `{"#list": [...], "#type": "number[]"}`
- `{"#literal": 42, "#type": "integer"}`"##;

pub(crate) fn orphaned_type(span: SpanId) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::OrphanedType, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Cannot use this keyword alone"));

    diagnostic.help = Some(Help::new(ORPHANED_TYPE_HELP));
    diagnostic.note = Some(Note::new(ORPHANED_TYPE_NOTE));

    diagnostic
}

const DUPLICATE_KEY_HELP: &str =
    "J-Expr does not allow duplicate keys in the same object. Each key must be unique.";

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
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::DuplicateKey, Severity::ERROR);

    // Label for the duplicate occurrence
    diagnostic
        .labels
        .push(Label::new(duplicate_span, "Duplicate key").with_order(0));

    // Label for the first occurrence
    diagnostic.labels.push(
        Label::new(
            first_span,
            format!("First occurrence of `{}`", key.as_ref()),
        )
        .with_order(1),
    );

    diagnostic.help = Some(Help::new(DUPLICATE_KEY_HELP));

    diagnostic
}
