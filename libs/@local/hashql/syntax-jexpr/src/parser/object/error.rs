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

const EXPECTED_SEPARATOR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-separator",
    name: "Expected array separator or closing bracket",
};

const EXPECTED_COLON: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-colon",
    name: "Expected colon",
};

const EXPECTED_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-key",
    name: "Expected key",
};

const EXPECTED_VALUE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-value",
    name: "Expected value",
};

const LEADING_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "leading-comma",
    name: "Unexpected leading comma",
};

const TRAILING_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "trailing-comma",
    name: "Unexpected trailing comma",
};

const CONSECUTIVE_COMMA: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "consecutive-comma",
    name: "Consecutive commas",
};

const CONSECUTIVE_COLON: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "consecutive-colon",
    name: "Consecutive colons",
};

const EMPTY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty",
    name: "Expected non-empty object",
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
    Empty,
}

impl DiagnosticCategory for ObjectDiagnosticCategory {
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
            Self::Lexer(lexer) => Some(lexer),
            Self::ExpectedColon => Some(&EXPECTED_COLON),
            Self::ExpectedSeparator => Some(&EXPECTED_SEPARATOR),
            Self::ExpectedKey => Some(&EXPECTED_KEY),
            Self::ExpectedValue => Some(&EXPECTED_VALUE),
            Self::LeadingComma => Some(&LEADING_COMMA),
            Self::TrailingComma => Some(&TRAILING_COMMA),
            Self::ConsecutiveComma => Some(&CONSECUTIVE_COMMA),
            Self::ConsecutiveColon => Some(&CONSECUTIVE_COLON),
            Self::Empty => Some(&EMPTY),
        }
    }
}

impl From<LexerDiagnosticCategory> for ObjectDiagnosticCategory {
    fn from(value: LexerDiagnosticCategory) -> Self {
        Self::Lexer(value)
    }
}

const EMPTY_HELP: &str = r##"In J-Expr syntax, objects must contain at least one key-value pair. For example: `{"#literal": 1}`"##;

const EMPTY_NOTE: &str = r##"The following constructs are supported:
- `{"#struct": ..., "#type"?: ...}`
- `{"#dict": ..., "#type"?: ...}`
- `{"#tuple": ..., "#type"?: ...}`
- `{"#list": ..., "#type"?: ...}`
- `{"#literal": ...}`
- `{"#type": ...}`
"##;

pub(crate) fn empty(span: SpanId) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::Empty, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "This array is empty"));

    diagnostic.help = Some(Help::new(EMPTY_HELP));
    diagnostic.note = Some(Note::new(EMPTY_NOTE));

    diagnostic
}

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn trailing_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::TrailingComma, Severity::ERROR);

    for (index, &span) in spans.iter().rev().enumerate() {
        let message = if index == 0 {
            "Remove this comma"
        } else {
            "... and this comma"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order(index as i32));
    }

    diagnostic.help = Some(Help::new(
        "Unlike JavaScript or some other languages, J-Expr does not support trailing commas in \
         objects",
    ));

    diagnostic
}

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn leading_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::LeadingComma, Severity::ERROR);

    for (index, &span) in spans.iter().rev().enumerate() {
        let message = if index == 0 {
            "Remove this comma"
        } else {
            "... and this comma"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order(index as i32));
    }

    diagnostic.help = Some(Help::new(
        "Unlike JavaScript or some other languages, J-Expr does not support leading commas in \
         objects",
    ));

    diagnostic
}

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn consecutive_commas(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveComma, Severity::ERROR);

    for (index, &span) in spans.iter().rev().enumerate() {
        let message = if index == 0 {
            "Remove this comma"
        } else {
            "... and this comma"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order(index as i32));
    }

    diagnostic.help = Some(Help::new(
        "Unlike JavaScript or some other languages, J-Expr does not support consecutive commas in \
         objects",
    ));

    diagnostic
}

#[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
pub(crate) fn consecutive_colons(spans: &[SpanId]) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveColon, Severity::ERROR);

    for (index, &span) in spans.iter().rev().enumerate() {
        let message = if index == 0 {
            "Remove this colon"
        } else {
            "... and this colon"
        };

        diagnostic
            .labels
            .push(Label::new(span, message).with_order(index as i32));
    }

    diagnostic.help = Some(Help::new(
        "J-Expr does not support consecutive colons in objects. Each key should have exactly one \
         colon followed by a value.",
    ));

    diagnostic
}
