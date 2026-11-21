use alloc::borrow::Cow;

use hashql_core::{heap::Heap, span::SpanId};
use hashql_diagnostics::{
    Diagnostic, Label, Patch, Suggestions,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Critical,
};

use super::{ConstructorKind, format_backticked_or_list, suggest_similar};

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
    name: "Consecutive colons in object",
};

const UNKNOWN_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unknown-key",
    name: "Unknown object key",
};

const CONFLICTING_CONSTRUCTOR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "conflicting-constructor",
    name: "Conflicting constructor keys",
};

const EMPTY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty",
    name: "Empty object not allowed",
};

const ORPHANED_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "orphaned-type",
    name: "Orphaned `#type` field",
};

const DUPLICATE_KEY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-key",
    name: "Duplicate key in object",
};

const STRUCT_EXPECTED_OBJECT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "struct-expected-object",
    name: "Expected object for `#struct`",
};

const STRUCT_KEY_EXPECTED_IDENTIFIER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "struct-key-expected-identifier",
    name: "Invalid struct field identifier",
};

const DICT_EXPECTED_FORMAT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "dict-expected-format",
    name: "Expected object or array of pairs for `#dict`",
};

const DICT_ENTRY_TOO_FEW_ITEMS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "dict-entry-too-few-items",
    name: "Too few items in dictionary entry",
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
    name: "Expected array for `#tuple`",
};

const LIST_EXPECTED_ARRAY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "list-expected-array",
    name: "Expected array for `#list`",
};

const TYPE_EXPECTED_STRING: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-expected-string",
    name: "Expected string for `#type`",
};

const LITERAL_EXPECTED_PRIMITIVE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "literal-expected-primitive",
    name: "Expected primitive value for `#literal`",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ObjectDiagnosticCategory {
    LeadingComma,
    TrailingComma,
    ConsecutiveComma,
    ConsecutiveColon,
    UnknownKey,
    /// Multiple distinct primary constructor keys in the same object.
    ConflictingConstructor,
    Empty,
    /// `#type` field without a primary constructor field in the same object.
    OrphanedType,
    DuplicateKey,
    StructExpectedObject,
    StructKeyExpectedIdentifier,
    /// Value supplied to `#dict` that is neither an object nor an array of pairs.
    DictExpectedFormat,
    DictEntryTooFewItems,
    DictEntryTooManyItems,
    DictEntryExpectedArray,
    TupleExpectedArray,
    ListExpectedArray,
    TypeExpectedString,
    LiteralExpectedPrimitive,
}

impl DiagnosticCategory for ObjectDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("object")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Object")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::LeadingComma => Some(&LEADING_COMMA),
            Self::TrailingComma => Some(&TRAILING_COMMA),
            Self::ConsecutiveComma => Some(&CONSECUTIVE_COMMA),
            Self::ConsecutiveColon => Some(&CONSECUTIVE_COLON),
            Self::UnknownKey => Some(&UNKNOWN_KEY),
            Self::ConflictingConstructor => Some(&CONFLICTING_CONSTRUCTOR),
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

pub(crate) type ObjectDiagnostic<K = Critical> = Diagnostic<ObjectDiagnosticCategory, SpanId, K>;

const MAX_EXTRA_LABELS: usize = 2;

const EMPTY_HELP: &str = r##"specify a constructor key such as `{"#literal": 42}`, `{"#struct": {}}`, or `{"#dict": {}}`"##;

const EMPTY_NOTE_TYPED: &str = r##"J-Expr objects must contain a constructor key:
- `{"#literal": value}` for primitive literals
- `{"#struct": {...}}` for structs with named fields
- `{"#dict": {...}}` or `{"#dict": [[k, v], ...]}` for dictionaries
- `{"#tuple": [...]}` for fixed-size tuples
- `{"#list": [...]}` for lists
each construct also accepts an optional `"#type"` annotation"##;

const EMPTY_NOTE_UNTYPED: &str = r##"J-Expr objects must contain a constructor key:
- `{"#literal": value}` for primitive literals
- `{"#struct": {...}}` for structs with named fields
- `{"#dict": {...}}` or `{"#dict": [[k, v], ...]}` for dictionaries
- `{"#tuple": [...]}` for fixed-size tuples
- `{"#list": [...]}` for lists"##;

pub(crate) fn empty(span: SpanId, allow_type_annotations: bool) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::Empty, Critical::ERROR).primary(
        Label::new(span, "empty objects are not allowed as expressions"),
    );
    diagnostic.add_message(Message::help(EMPTY_HELP));
    diagnostic.add_message(Message::note(if allow_type_annotations {
        EMPTY_NOTE_TYPED
    } else {
        EMPTY_NOTE_UNTYPED
    }));
    diagnostic
}

pub(crate) fn trailing_commas(
    first: SpanId,
    rest: &[SpanId],
    patch_span: Option<SpanId>,
) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::TrailingComma, Critical::ERROR).primary(
            Label::new(first, "trailing comma is not allowed in objects"),
        );

    for &span in rest.iter().take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(span, "additional trailing comma"));
    }

    let help_text = if rest.is_empty() {
        "remove the trailing comma"
    } else {
        "remove the trailing commas"
    };
    if let Some(patch_span) = patch_span {
        let suggestion = Suggestions::patch(Patch::new(patch_span, ""));
        diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help(help_text));
    }

    diagnostic.add_message(Message::note(
        "J-Expr follows JSON syntax, which does not allow trailing commas",
    ));
    diagnostic
}

pub(crate) fn leading_commas(
    first: SpanId,
    rest: &[SpanId],
    patch_span: Option<SpanId>,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::LeadingComma, Critical::ERROR)
        .primary(Label::new(first, "leading comma is not allowed in objects"));

    for &span in rest.iter().take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(span, "additional leading comma"));
    }

    let help_text = if rest.is_empty() {
        "remove the leading comma"
    } else {
        "remove the leading commas"
    };
    if let Some(patch_span) = patch_span {
        let suggestion = Suggestions::patch(Patch::new(patch_span, ""));
        diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help(help_text));
    }

    diagnostic.add_message(Message::note(
        "J-Expr follows JSON syntax, which does not allow leading commas",
    ));
    diagnostic
}

pub(crate) fn consecutive_commas(
    first: SpanId,
    rest: &[SpanId],
    patch_span: Option<SpanId>,
) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveComma, Critical::ERROR).primary(
            Label::new(first, "consecutive comma is not allowed in objects"),
        );

    for &span in rest.iter().take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(span, "additional extra comma"));
    }

    let help_text = if rest.is_empty() {
        "remove the extra comma"
    } else {
        "remove the extra commas"
    };
    if let Some(patch_span) = patch_span {
        let suggestion = Suggestions::patch(Patch::new(patch_span, ""));
        diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help(help_text));
    }

    diagnostic.add_message(Message::note(
        "object entries must be separated by a single comma",
    ));
    diagnostic
}

pub(crate) fn consecutive_colons(
    first: SpanId,
    rest: &[SpanId],
    patch_span: Option<SpanId>,
) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::ConsecutiveColon, Critical::ERROR).primary(
            Label::new(
                first,
                "consecutive colon is not allowed between key and value",
            ),
        );

    for &span in rest.iter().take(MAX_EXTRA_LABELS) {
        diagnostic.add_label(Label::new(span, "additional extra colon"));
    }

    let help_text = if rest.is_empty() {
        "remove the extra colon"
    } else {
        "remove the extra colons"
    };
    if let Some(patch_span) = patch_span {
        let suggestion = Suggestions::patch(Patch::new(patch_span, ""));
        diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help(help_text));
    }

    diagnostic.add_message(Message::note(
        "object keys and values must be separated by a single `:`",
    ));
    diagnostic
}

pub(crate) fn unknown_key(
    span: SpanId,
    key: &str,
    expected: &[&'static str],
    primary_context: Option<(ConstructorKind, SpanId)>,
    type_annotations_disallowed: bool,
    heap: Option<&Heap>,
) -> ObjectDiagnostic {
    // Labels are not escaped by annotate-snippets, so escape control characters in user keys.
    let escaped_key = key.escape_debug().to_string();

    if type_annotations_disallowed {
        let mut diagnostic =
            Diagnostic::new(ObjectDiagnosticCategory::UnknownKey, Critical::ERROR).primary(
                Label::new(span, "`#type` annotations are not allowed in this grammar"),
            );
        if let Some((ctor, primary_span)) = primary_context {
            diagnostic.add_label(Label::new(
                primary_span,
                format!("in this `{}` object", ctor.key()),
            ));
        }
        diagnostic.add_message(Message::help("remove the `#type` field"));
        return diagnostic;
    }

    let primary_label = match primary_context {
        Some((ctor, _)) if expected.is_empty() => {
            format!("unexpected key `{escaped_key}` in `{}` object", ctor.key())
        }
        _ => format!("unknown object key `{escaped_key}`"),
    };

    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::UnknownKey, Critical::ERROR)
        .primary(Label::new(span, primary_label));

    if let Some((ctor, primary_span)) = primary_context {
        diagnostic.add_label(Label::new(
            primary_span,
            format!("in this `{}` object", ctor.key()),
        ));
    }

    if expected.is_empty() {
        diagnostic.add_message(Message::help(format!("remove the `{escaped_key}` key")));
        let note = primary_context.map_or_else(
            || Cow::Borrowed("no additional keys are allowed in this J-Expr object"),
            |(ctor, _)| {
                Cow::Owned(format!(
                    "a `{}` object accepts no additional keys",
                    ctor.key()
                ))
            },
        );
        diagnostic.add_message(Message::note(note));
        return diagnostic;
    }

    let similar = suggest_similar(key, expected, heap, 2);
    if let Some(suggestions) = Suggestions::try_from_iter(
        similar
            .into_iter()
            .map(|candidate| Patch::new(span, format!("\"{candidate}\""))),
    ) {
        diagnostic.add_message(
            Message::help("a similar J-Expr key exists").with_suggestions(suggestions),
        );
    } else if primary_context.is_none() {
        diagnostic.add_message(Message::help(
            r##"wrap named fields in `{"#struct": {...}}` or `{"#dict": {...}}`, or use a constructor key"##,
        ));
    } else {
        let list = format_backticked_or_list(expected);
        diagnostic.add_message(Message::help(format!(
            "remove `{escaped_key}` or replace it with {list}"
        )));
    }

    let list = format_backticked_or_list(expected);
    diagnostic.add_message(Message::note(format!(
        "valid keys in this position are {list}"
    )));
    diagnostic
}

pub(crate) fn conflicting_constructor(
    existing_span: SpanId,
    found_span: SpanId,
    existing: ConstructorKind,
    found: ConstructorKind,
    allow_type: bool,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ObjectDiagnosticCategory::ConflictingConstructor,
        Critical::ERROR,
    )
    .primary(Label::new(
        found_span,
        format!(
            "cannot combine `{}` with `{}` in the same object",
            found.key(),
            existing.key()
        ),
    ));

    diagnostic.add_label(Label::new(
        existing_span,
        format!("object already defined as `{}` here", existing.key()),
    ));

    let help = if allow_type {
        format!(
            "keep a single constructor key; `{}` only accepts `#type` as an additional key",
            existing.key()
        )
    } else {
        format!("remove `{}` or move it into its own object", found.key())
    };
    diagnostic.add_message(Message::help(help));
    diagnostic.add_message(Message::note(
        "each J-Expr object represents a single constructor",
    ));
    diagnostic
}

const ORPHANED_TYPE_NOTE: &str = r##"`#type` annotates a constructor in the same object:
- `{"#literal": 42, "#type": "Int"}`
- `{"#struct": {"x": {"#literal": 1}}, "#type": "Point"}`
- `{"#list": [], "#type": "List<Int>"}`"##;

pub(crate) fn orphaned_type(span: SpanId) -> ObjectDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ObjectDiagnosticCategory::OrphanedType, Critical::ERROR).primary(
            Label::new(span, "`#type` cannot be used without a constructor key"),
        );

    diagnostic.add_message(Message::help(
        "add a constructor key such as `#literal`, `#struct`, `#tuple`, `#list`, or `#dict` to \
         this object",
    ));
    diagnostic.add_message(Message::note(ORPHANED_TYPE_NOTE));
    diagnostic
}

pub(crate) fn duplicate_key(
    first_span: SpanId,
    duplicate_span: SpanId,
    key: &str,
) -> ObjectDiagnostic {
    let mut diagnostic = Diagnostic::new(ObjectDiagnosticCategory::DuplicateKey, Critical::ERROR)
        .primary(Label::new(duplicate_span, format!("duplicate key `{key}`")));
    diagnostic.add_label(Label::new(
        first_span,
        format!("first occurrence of `{key}` here"),
    ));
    diagnostic.add_message(Message::help(format!(
        "remove one of the duplicate `{key}` entries"
    )));
    diagnostic.add_message(Message::note(
        "object keys must be unique within the same object",
    ));
    diagnostic
}
