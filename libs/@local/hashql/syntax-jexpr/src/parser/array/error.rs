use alloc::borrow::Cow;

use hashql_core::span::{SpanId, storage::SpanStorage};
use hashql_diagnostics::{
    Diagnostic, Help, Label, Note,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    severity::Severity,
};
use winnow::error::{ContextError, ParseError};

use crate::{lexer::error::LexerDiagnosticCategory, span::Span};

pub(crate) type ArrayDiagnostic = Diagnostic<ArrayDiagnosticCategory, SpanId>;

const LEADING_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "leading-comma",
    name: "Unexpected leading comma in array",
};

const TRAILING_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "trailing-comma",
    name: "Unexpected trailing comma in array",
};

const CONSECUTIVE_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "consecutive-comma",
    name: "Consecutive commas in array",
};

const EMPTY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty",
    name: "Empty array not allowed",
};

const LABELED_ARGUMENT_MISSING_PREFIX: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "labeled-argument-missing-prefix",
    name: "Missing `:` prefix in labeled argument",
};

const LABELED_ARGUMENT_LENGTH_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "labeled-argument-length-mismatch",
    name: "Invalid number of labeled arguments",
};

const LABELED_ARGUMENT_INVALID_IDENTIFIER: TerminalDiagnosticCategory =
    TerminalDiagnosticCategory {
        id: "labeled-argument-invalid-identifier",
        name: "Invalid identifier in labeled argument",
    };

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ArrayDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    LeadingComma,
    TrailingComma,
    ConsecutiveComma,
    Empty,
    LabeledArgumentMissingPrefix,
    LabeledArgumentLengthMismatch,
    LabeledArgumentInvalidIdentifier,
}

impl ArrayDiagnosticCategory {
    pub(crate) fn hoist(&self) -> &dyn DiagnosticCategory {
        match self {
            Self::Lexer(category) => category.subcategory().unwrap_or(category),
            Self::LeadingComma
            | Self::TrailingComma
            | Self::ConsecutiveComma
            | Self::Empty
            | Self::LabeledArgumentMissingPrefix
            | Self::LabeledArgumentLengthMismatch
            | Self::LabeledArgumentInvalidIdentifier => self,
        }
    }
}

impl DiagnosticCategory for ArrayDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.id(),
            Self::LeadingComma
            | Self::TrailingComma
            | Self::ConsecutiveComma
            | Self::Empty
            | Self::LabeledArgumentMissingPrefix
            | Self::LabeledArgumentLengthMismatch
            | Self::LabeledArgumentInvalidIdentifier => Cow::Borrowed("array"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.name(),
            Self::LeadingComma
            | Self::TrailingComma
            | Self::ConsecutiveComma
            | Self::Empty
            | Self::LabeledArgumentMissingPrefix
            | Self::LabeledArgumentLengthMismatch
            | Self::LabeledArgumentInvalidIdentifier => Cow::Borrowed("Array"),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Lexer(category) => category.subcategory(),
            Self::LeadingComma => Some(&LEADING_COMMA),
            Self::TrailingComma => Some(&TRAILING_COMMA),
            Self::ConsecutiveComma => Some(&CONSECUTIVE_COMMA),
            Self::Empty => Some(&EMPTY),
            Self::LabeledArgumentMissingPrefix => Some(&LABELED_ARGUMENT_MISSING_PREFIX),
            Self::LabeledArgumentLengthMismatch => Some(&LABELED_ARGUMENT_LENGTH_MISMATCH),
            Self::LabeledArgumentInvalidIdentifier => Some(&LABELED_ARGUMENT_INVALID_IDENTIFIER),
        }
    }
}

impl From<LexerDiagnosticCategory> for ArrayDiagnosticCategory {
    fn from(value: LexerDiagnosticCategory) -> Self {
        Self::Lexer(value)
    }
}

const EMPTY_HELP: &str = r##"In J-Expr syntax, arrays must contain at least one element that represents the function to be called. For example: ["add", {"#literal": 1}, {"#literal": 2}] calls the 'add' function with arguments 1 and 2."##;

const EMPTY_NOTE: &str = r##"Valid examples:
- `["get", "user"]` - Calls 'get' with argument 'user'
- `["map", "identity", [{"#literal": 1}, {"#literal": 2}, {"#literal": 3}]]` - Calls 'map' with a function and array
"##;

pub(crate) fn empty(span: SpanId) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::Empty, Severity::Error);

    diagnostic
        .labels
        .push(Label::new(span, "Empty array not allowed"));

    diagnostic.add_help(Help::new(EMPTY_HELP));
    diagnostic.add_note(Note::new(EMPTY_NOTE));

    diagnostic
}

const TRAILING_COMMA_HELP: &str = "J-Expr does not support trailing commas in arrays. Use \
                                   `[item1, item2]` instead of `[item1, item2,]`";

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn trailing_commas(spans: &[SpanId]) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::TrailingComma, Severity::Error);

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

const LEADING_COMMA_HELP: &str =
    "J-Expr does not support leading commas in arrays. Use `[item1, item2]` format.";

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn leading_commas(spans: &[SpanId]) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::LeadingComma, Severity::Error);

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

const CONSECUTIVE_COMMA_HELP: &str =
    "J-Expr requires exactly one comma between array elements. Use `[item1, item2, item3]` format.";

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn consecutive_commas(spans: &[SpanId]) -> ArrayDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ArrayDiagnosticCategory::ConsecutiveComma, Severity::Error);

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

const LABELED_ARGUMENT_PREFIX_NOTE: &str = r#"In J-Expr, labeled arguments use the format:
- `["function", {":label": value}]`
- `["function", {":label1": value1}, {":label2": value2}]`
- `["function", ":variable1"]`

The colon prefix (':') is required to distinguish labeled arguments from positional arguments."#;

pub(crate) fn labeled_argument_missing_prefix(
    span: SpanId,
    actual: impl AsRef<str>,
) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ArrayDiagnosticCategory::LabeledArgumentMissingPrefix,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Missing ':' prefix"));

    let help_message = format!(
        "Add ':' prefix to '{}' to make it a valid labeled argument",
        actual.as_ref()
    );
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(LABELED_ARGUMENT_PREFIX_NOTE));

    diagnostic
}

pub(crate) fn labeled_arguments_length_mismatch(
    span: SpanId,
    extra: impl IntoIterator<Item = SpanId>,
    count: usize,
) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ArrayDiagnosticCategory::LabeledArgumentLengthMismatch,
        Severity::Error,
    );

    if count == 0 {
        diagnostic
            .labels
            .push(Label::new(span, "Add exactly one key-value pair"));
    } else {
        diagnostic
            .labels
            .push(Label::new(span, "Remove extra arguments"));

        let mut index = -1;

        for extra_span in extra {
            diagnostic.labels.push(
                Label::new(extra_span, "... remove this extraneous argument").with_order(index),
            );

            index -= 1;
        }
    }

    let help_message = if count == 0 {
        Cow::Borrowed(
            "Labeled arguments require exactly one key-value pair in the format {\":key\": value}",
        )
    } else {
        Cow::Owned(format!(
            "Labeled arguments must contain exactly one key-value pair, but {count} were provided",
        ))
    };
    diagnostic.add_help(Help::new(help_message));

    diagnostic.add_note(Note::new(LABELED_ARGUMENT_PREFIX_NOTE));

    diagnostic
}

const LABELED_ARGUMENT_IDENTIFIER_HELP: &str =
    "Labeled argument identifiers must be valid HashQL identifiers";

pub(crate) fn labeled_argument_invalid_identifier<I>(
    spans: &SpanStorage<Span>,
    label_span: SpanId,
    parse_error: ParseError<I, ContextError>,
) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ArrayDiagnosticCategory::LabeledArgumentInvalidIdentifier,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(label_span, "Invalid labeled argument name"));

    let (_, expected) =
        crate::parser::string::error::convert_parse_error(spans, label_span, parse_error);

    if let Some(expected) = expected {
        diagnostic.add_help(Help::new(expected));
    }

    diagnostic.add_note(Note::new(LABELED_ARGUMENT_IDENTIFIER_HELP));

    diagnostic
}
