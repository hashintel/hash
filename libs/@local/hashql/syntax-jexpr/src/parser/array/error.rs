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

pub(crate) type ArrayDiagnostic = Diagnostic<ArrayDiagnosticCategory, SpanId>;

const EXPECTED_SEPARATOR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-separator",
    name: "Expected array separator (comma) or closing bracket",
};

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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ArrayDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    ExpectedSeparator,
    LeadingComma,
    TrailingComma,
    ConsecutiveComma,
    Empty,
}

impl DiagnosticCategory for ArrayDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.id(),
            _ => Cow::Borrowed("array"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.name(),
            _ => Cow::Borrowed("Array"),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Lexer(category) => Some(category),
            Self::ExpectedSeparator => Some(&EXPECTED_SEPARATOR),
            Self::LeadingComma => Some(&LEADING_COMMA),
            Self::TrailingComma => Some(&TRAILING_COMMA),
            Self::ConsecutiveComma => Some(&CONSECUTIVE_COMMA),
            Self::Empty => Some(&EMPTY),
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
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::Empty, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Empty array not allowed"));

    diagnostic.help = Some(Help::new(EMPTY_HELP));
    diagnostic.note = Some(Note::new(EMPTY_NOTE));

    diagnostic
}

const TRAILING_COMMA_HELP: &str = "J-Expr does not support trailing commas in arrays. Use \
                                   `[item1, item2]` instead of `[item1, item2,]`";

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn trailing_commas(spans: &[SpanId]) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::TrailingComma, Severity::ERROR);

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

const LEADING_COMMA_HELP: &str =
    "J-Expr does not support leading commas in arrays. Use `[item1, item2]` format.";

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn leading_commas(spans: &[SpanId]) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::LeadingComma, Severity::ERROR);

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

const CONSECUTIVE_COMMA_HELP: &str =
    "J-Expr requires exactly one comma between array elements. Use `[item1, item2, item3]` format.";

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn consecutive_commas(spans: &[SpanId]) -> ArrayDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ArrayDiagnosticCategory::ConsecutiveComma, Severity::ERROR);

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
