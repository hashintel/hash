use alloc::borrow::Cow;
use core::alloc::Allocator;

use hashql_core::span::{SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic, Label, Patch, Suggestions,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Critical,
};
use winnow::error::ContextError;

use crate::{
    embedded::error::{ParseErrorSource, convert_parse_error_in},
    span::Span,
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
    LeadingComma,
    TrailingComma,
    ConsecutiveComma,
    Empty,
    /// Secondary key in a labeled-argument object lacking a leading `:`.
    LabeledArgumentMissingPrefix,
    /// Labeled-argument object containing zero or more than one entry.
    LabeledArgumentLengthMismatch,
    /// Labeled-argument key whose name after `:` is not a valid HashQL identifier.
    LabeledArgumentInvalidIdentifier,
}

impl DiagnosticCategory for ArrayDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("array")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Array")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
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

pub(crate) type ArrayDiagnostic<K = Critical> = Diagnostic<ArrayDiagnosticCategory, SpanId, K>;

const MAX_EXTRA_LABELS: usize = 2;

const EMPTY_HELP: &str =
    r##"add a function expression as the first element, or use `{"#list": []}` for an empty list"##;

const EMPTY_NOTE: &str = r##"in J-Expr, bare arrays represent function calls whose first element is the callee:
- `["get", "user"]` calls `get` with `user`
- `{"#list": []}` constructs an empty list
- `{"#tuple": []}` constructs an empty tuple"##;

pub(crate) fn empty(span: SpanId) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::Empty, Critical::ERROR).primary(
        Label::new(span, "empty arrays are not allowed as expressions"),
    );
    diagnostic.add_message(Message::help(EMPTY_HELP));
    diagnostic.add_message(Message::note(EMPTY_NOTE));
    diagnostic
}

pub(crate) fn trailing_commas(
    first: SpanId,
    rest: impl IntoIterator<Item = SpanId, IntoIter: ExactSizeIterator>,
    patch_span: SpanId,
) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::TrailingComma, Critical::ERROR)
        .primary(Label::new(first, "trailing comma is not allowed in arrays"));

    let rest = rest.into_iter();
    let rest_len = rest.len();

    for span in rest.take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(span, "additional trailing comma"));
    }

    let help_text = if rest_len == 0 {
        "remove the trailing comma"
    } else {
        "remove the trailing commas"
    };

    let suggestion = Suggestions::patch(Patch::new(patch_span, ""));
    diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));

    diagnostic.add_message(Message::note(
        "J-Expr follows JSON syntax, which does not allow trailing commas",
    ));
    diagnostic
}

pub(crate) fn leading_commas(
    first: SpanId,
    rest: impl IntoIterator<Item = SpanId, IntoIter: ExactSizeIterator>,
    patch_span: SpanId,
) -> ArrayDiagnostic {
    let mut diagnostic = Diagnostic::new(ArrayDiagnosticCategory::LeadingComma, Critical::ERROR)
        .primary(Label::new(first, "leading comma is not allowed in arrays"));
    let rest = rest.into_iter();
    let rest_len = rest.len();

    for span in rest.take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(span, "additional leading comma"));
    }

    let help_text = if rest_len == 0 {
        "remove the leading comma"
    } else {
        "remove the leading commas"
    };

    let suggestion = Suggestions::patch(Patch::new(patch_span, ""));
    diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));

    diagnostic.add_message(Message::note(
        "J-Expr follows JSON syntax, which does not allow leading commas",
    ));
    diagnostic
}

pub(crate) fn consecutive_commas(
    first: SpanId,
    rest: impl IntoIterator<Item = SpanId, IntoIter: ExactSizeIterator>,
    patch_span: SpanId,
) -> ArrayDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ArrayDiagnosticCategory::ConsecutiveComma, Critical::ERROR).primary(
            Label::new(first, "consecutive comma is not allowed in arrays"),
        );

    let rest = rest.into_iter();
    let rest_len = rest.len();

    for span in rest.take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(span, "additional extra comma"));
    }

    let help_text = if rest_len == 0 {
        "remove the extra comma"
    } else {
        "remove the extra commas"
    };

    let suggestion = Suggestions::patch(Patch::new(patch_span, ""));
    diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));

    diagnostic.add_message(Message::note(
        "array elements must be separated by a single comma",
    ));
    diagnostic
}

const LABELED_ARGUMENT_NOTE: &str =
    r#"labeled arguments use `{":label": value}` (one entry per object) or shorthand `":label"`"#;

pub(crate) fn labeled_argument_missing_prefix(
    span: SpanId,
    insert_span: Option<SpanId>,
    actual: &str,
) -> ArrayDiagnostic {
    let escaped = actual.escape_debug();
    let mut diagnostic = Diagnostic::new(
        ArrayDiagnosticCategory::LabeledArgumentMissingPrefix,
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        format!("labeled argument key `{escaped}` must start with `:`"),
    ));

    let help_text = format!("prefix `{escaped}` with `:`");
    if let Some(insert_span) = insert_span {
        let suggestion = Suggestions::patch(Patch::new(insert_span, ":"));
        diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help(help_text));
    }

    diagnostic.add_message(Message::note(LABELED_ARGUMENT_NOTE));
    diagnostic
}

pub(crate) fn labeled_arguments_length_mismatch(
    primary: SpanId,
    first_entry: Option<SpanId>,
    extra: impl IntoIterator<Item = SpanId>,
    split_comma: Option<SpanId>,
    count: usize,
) -> ArrayDiagnostic {
    let diagnostic = Diagnostic::new(
        ArrayDiagnosticCategory::LabeledArgumentLengthMismatch,
        Critical::ERROR,
    );

    if count == 0 {
        let mut diagnostic = diagnostic.primary(Label::new(
            primary,
            "labeled argument object cannot be empty",
        ));
        diagnostic.add_message(Message::help(
            r#"add a single `":label": value` entry to this object"#,
        ));
        diagnostic.add_message(Message::note(LABELED_ARGUMENT_NOTE));
        return diagnostic;
    }

    let mut diagnostic = diagnostic.primary(Label::new(
        primary,
        format!("expected 1 labeled argument per object, found {count}"),
    ));

    if let Some(first_span) = first_entry {
        diagnostic.add_label(Label::new(first_span, "first labeled argument here"));
    }

    for extra_span in extra.into_iter().take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(extra_span, "additional labeled argument"));
    }

    if let Some(comma_span) = split_comma {
        let suggestion = Suggestions::patch(Patch::new(comma_span, "}, {"));
        diagnostic.add_message(
            Message::help("place each labeled argument in its own object")
                .with_suggestions(suggestion),
        );
    } else {
        diagnostic.add_message(Message::help(
            r#"place each labeled argument in its own object: `{":a": "x"}, {":b": "y"}`"#,
        ));
    }

    diagnostic.add_message(Message::note(LABELED_ARGUMENT_NOTE));
    diagnostic
}

const LABELED_ARGUMENT_IDENTIFIER_NOTE: &str =
    "labeled argument names must be valid HashQL identifiers";

pub(crate) fn labeled_argument_invalid_identifier_in<A: Allocator>(
    spans: &mut SpanTable<Span>,
    label_span: SpanId,
    raw_quoted: &str,
    decoded: &str,
    parse_error: (usize, ContextError),
    alloc: A,
) -> ArrayDiagnostic {
    if decoded == ":" {
        let mut diagnostic = Diagnostic::new(
            ArrayDiagnosticCategory::LabeledArgumentInvalidIdentifier,
            Critical::ERROR,
        )
        .primary(Label::new(
            label_span,
            "missing identifier after `:` in labeled argument",
        ));
        diagnostic.add_message(Message::help(
            "add a valid identifier name after `:`, for example `\":name\"`",
        ));
        diagnostic.add_message(Message::note(LABELED_ARGUMENT_IDENTIFIER_NOTE));
        return diagnostic;
    }

    let parts = convert_parse_error_in(
        spans,
        label_span,
        ParseErrorSource {
            raw_quoted,
            decoded,
            kind_name: "labeled argument identifier",
            start_offset: 1,
        },
        parse_error,
        alloc,
    );

    let mut diagnostic = Diagnostic::new(
        ArrayDiagnosticCategory::LabeledArgumentInvalidIdentifier,
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
            "use a valid HashQL identifier after `:`, starting with a letter, `_`, or symbol",
        ));
    }

    diagnostic.add_message(Message::note(LABELED_ARGUMENT_IDENTIFIER_NOTE));
    diagnostic
}
