use hashql_core::{heap::Heap, span::SpanTable};
use text_size::{TextRange, TextSize};

use super::{
    ArrayDiagnosticCategory, ConstructorKind, EofContext, JExprDiagnostic, JExprDiagnosticCategory,
    LexerDiagnosticCategory, ObjectDiagnosticCategory, ParserDiagnosticCategory,
    StringErrorContext, UnexpectedTokenContext, ValueKind, array, constructor, expected_eof,
    insert_range, insert_ranges, lexer, number, object, string, wrap_array, wrap_lexer,
    wrap_object,
};
use crate::{
    lexer::{ParseNumberErrorKind, StringError},
    parser::recovery::Separators,
    span::Span,
    syntax_kind::SyntaxKind,
    syntax_kind_set::SyntaxKindSet,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LexerErrorKind {
    InvalidString {
        error: StringError,
        context: StringErrorContext,
    },
    SingleQuotedString {
        replacement: Option<String>,
    },
    InvalidNumber {
        error: ParseNumberErrorKind,
        token_range: TextRange,
        raw: String,
    },
    InvalidCharacter {
        character: char,
    },
    InvalidToken {
        text: String,
    },
    UnterminatedBlockComment {
        eof: TextSize,
    },
    UnexpectedEof {
        expected: SyntaxKindSet,
        context: EofContext,
    },
    UnexpectedToken {
        found: SyntaxKind,
        expected: SyntaxKindSet,
        context: UnexpectedTokenContext,
    },
}

impl LexerErrorKind {
    const fn category(&self) -> LexerDiagnosticCategory {
        match self {
            Self::InvalidString { .. } | Self::SingleQuotedString { .. } => {
                LexerDiagnosticCategory::InvalidString
            }
            Self::InvalidNumber { .. } => LexerDiagnosticCategory::InvalidNumber,
            Self::InvalidCharacter { .. } => LexerDiagnosticCategory::InvalidCharacter,
            Self::InvalidToken { .. } => LexerDiagnosticCategory::InvalidToken,
            Self::UnterminatedBlockComment { .. } => {
                LexerDiagnosticCategory::UnterminatedBlockComment
            }
            Self::UnexpectedEof { .. } => LexerDiagnosticCategory::UnexpectedEof,
            Self::UnexpectedToken { .. } => LexerDiagnosticCategory::UnexpectedToken,
        }
    }

    fn to_diagnostic(
        &self,
        range: TextRange,
        primary: hashql_core::span::SpanId,
        heap: Option<&Heap>,
        spans: &mut SpanTable<Span>,
    ) -> lexer::LexerDiagnostic {
        match self {
            Self::InvalidString { error, context } => {
                string::from_string_error(*error, primary, context, spans)
            }
            Self::SingleQuotedString { replacement } => {
                string::single_quoted_string(primary, replacement.as_deref())
            }
            Self::InvalidNumber {
                error,
                token_range,
                raw,
            } => number::from_number_error(*error, range, *token_range, raw, spans),
            Self::InvalidCharacter { character } => {
                lexer::from_unrecognized_character_error(primary, *character)
            }
            Self::InvalidToken { text } => lexer::invalid_token(primary, text, heap),
            Self::UnterminatedBlockComment { eof } => {
                let eof_span = insert_range(spans, TextRange::empty(*eof));
                lexer::unterminated_block_comment(primary, eof_span)
            }
            Self::UnexpectedEof { expected, context } => {
                lexer::unexpected_eof(primary, *expected, context, spans)
            }
            Self::UnexpectedToken {
                found,
                expected,
                context,
            } => lexer::unexpected_token(primary, *found, *expected, context, spans),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ArrayErrorKind {
    Empty,
    LeadingCommas(Separators),
    TrailingCommas(Separators),
    ConsecutiveCommas(Separators),
    LabeledArgumentMissingPrefix {
        actual: String,
    },
    LabeledArgumentLengthMismatch {
        first_entry: Option<TextRange>,
        extra: Vec<TextRange>,
        split_comma: Option<TextRange>,
        count: usize,
    },
}

impl ArrayErrorKind {
    const fn category(&self) -> ArrayDiagnosticCategory {
        match self {
            Self::Empty => ArrayDiagnosticCategory::Empty,
            Self::LeadingCommas(_) => ArrayDiagnosticCategory::LeadingComma,
            Self::TrailingCommas(_) => ArrayDiagnosticCategory::TrailingComma,
            Self::ConsecutiveCommas(_) => ArrayDiagnosticCategory::ConsecutiveComma,
            Self::LabeledArgumentMissingPrefix { .. } => {
                ArrayDiagnosticCategory::LabeledArgumentMissingPrefix
            }
            Self::LabeledArgumentLengthMismatch { .. } => {
                ArrayDiagnosticCategory::LabeledArgumentLengthMismatch
            }
        }
    }

    fn to_diagnostic(
        &self,
        range: TextRange,
        primary: hashql_core::span::SpanId,
        spans: &mut SpanTable<Span>,
    ) -> array::ArrayDiagnostic {
        match self {
            Self::Empty => array::empty(primary),
            Self::LeadingCommas(separators) => {
                let patch = insert_range(spans, separators.range());
                let rest = insert_ranges(spans, &separators.secondary);

                array::leading_commas(primary, rest, patch)
            }
            Self::TrailingCommas(separators) => {
                let patch = insert_range(spans, separators.range());
                let rest = insert_ranges(spans, &separators.secondary);

                array::trailing_commas(primary, rest, patch)
            }
            Self::ConsecutiveCommas(separators) => {
                let patch = insert_range(spans, separators.range());
                let rest = insert_ranges(spans, &separators.secondary);

                array::consecutive_commas(primary, rest, patch)
            }
            Self::LabeledArgumentMissingPrefix { actual } => {
                let insert_pos = range.start() + TextSize::new(1);
                let insert_span = (insert_pos <= range.end())
                    .then(|| insert_range(spans, TextRange::empty(insert_pos)));
                array::labeled_argument_missing_prefix(primary, insert_span, actual)
            }
            Self::LabeledArgumentLengthMismatch {
                first_entry,
                extra,
                split_comma,
                count,
            } => {
                let first_span = first_entry.map(|span| insert_range(spans, span));
                let split_span = split_comma.map(|span| insert_range(spans, span));
                let extra_spans = insert_ranges(spans, extra);

                array::labeled_arguments_length_mismatch(
                    primary,
                    first_span,
                    extra_spans,
                    split_span,
                    *count,
                )
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ObjectErrorKind {
    Empty {
        allow_type_annotations: bool,
    },
    LeadingCommas(Separators),
    TrailingCommas(Separators),
    ConsecutiveCommas(Separators),
    ConsecutiveColons(Separators),
    UnknownKey {
        key: String,
        expected: &'static [&'static str],
        primary_key: Option<(ConstructorKind, TextRange)>,
        type_annotations_disallowed: bool,
    },
    ConflictingConstructor {
        existing: ConstructorKind,
        existing_range: TextRange,
        found: ConstructorKind,
        allow_type: bool,
    },
    DuplicateKey {
        first: TextRange,
        key: &'static str,
    },
    OrphanedType,
    StructExpectedObject {
        key: TextRange,
        found: Option<ValueKind>,
    },
    TupleExpectedArray {
        key: TextRange,
        found: Option<ValueKind>,
    },
    ListExpectedArray {
        key: TextRange,
        found: Option<ValueKind>,
    },
    DictExpectedFormat {
        key: TextRange,
        found: Option<ValueKind>,
    },
    DictEntryExpectedArray {
        dict_key: TextRange,
        found: Option<ValueKind>,
    },
    DictEntryTooFewItems {
        dict_key: TextRange,
        found: usize,
    },
    DictEntryTooManyItems {
        dict_key: TextRange,
        rest: Vec<TextRange>,
    },
    TypeExpectedString {
        key: TextRange,
        found: Option<ValueKind>,
    },
    LiteralExpectedPrimitive {
        key: TextRange,
        found: Option<ValueKind>,
    },
}

impl ObjectErrorKind {
    const fn category(&self) -> ObjectDiagnosticCategory {
        match self {
            Self::Empty { .. } => ObjectDiagnosticCategory::Empty,
            Self::LeadingCommas(_) => ObjectDiagnosticCategory::LeadingComma,
            Self::TrailingCommas(_) => ObjectDiagnosticCategory::TrailingComma,
            Self::ConsecutiveCommas(_) => ObjectDiagnosticCategory::ConsecutiveComma,
            Self::ConsecutiveColons(_) => ObjectDiagnosticCategory::ConsecutiveColon,
            Self::UnknownKey { .. } => ObjectDiagnosticCategory::UnknownKey,
            Self::ConflictingConstructor { .. } => ObjectDiagnosticCategory::ConflictingConstructor,
            Self::DuplicateKey { .. } => ObjectDiagnosticCategory::DuplicateKey,
            Self::OrphanedType => ObjectDiagnosticCategory::OrphanedType,
            Self::StructExpectedObject { .. } => ObjectDiagnosticCategory::StructExpectedObject,
            Self::TupleExpectedArray { .. } => ObjectDiagnosticCategory::TupleExpectedArray,
            Self::ListExpectedArray { .. } => ObjectDiagnosticCategory::ListExpectedArray,
            Self::DictExpectedFormat { .. } => ObjectDiagnosticCategory::DictExpectedFormat,
            Self::DictEntryExpectedArray { .. } => ObjectDiagnosticCategory::DictEntryExpectedArray,
            Self::DictEntryTooFewItems { .. } => ObjectDiagnosticCategory::DictEntryTooFewItems,
            Self::DictEntryTooManyItems { .. } => ObjectDiagnosticCategory::DictEntryTooManyItems,
            Self::TypeExpectedString { .. } => ObjectDiagnosticCategory::TypeExpectedString,
            Self::LiteralExpectedPrimitive { .. } => {
                ObjectDiagnosticCategory::LiteralExpectedPrimitive
            }
        }
    }

    fn to_diagnostic(
        &self,
        primary: hashql_core::span::SpanId,
        heap: Option<&Heap>,
        spans: &mut SpanTable<Span>,
    ) -> object::ObjectDiagnostic {
        match self {
            Self::Empty {
                allow_type_annotations,
            } => object::empty(primary, *allow_type_annotations),
            Self::LeadingCommas(separators) => {
                let patch = insert_range(spans, separators.range());
                let rest = insert_ranges(spans, &separators.secondary);
                object::leading_commas(primary, rest, patch)
            }
            Self::TrailingCommas(separators) => {
                let patch = insert_range(spans, separators.range());
                let rest = insert_ranges(spans, &separators.secondary);
                object::trailing_commas(primary, rest, patch)
            }
            Self::ConsecutiveCommas(separators) => {
                let patch = insert_range(spans, separators.range());
                let rest = insert_ranges(spans, &separators.secondary);
                object::consecutive_commas(primary, rest, patch)
            }
            Self::ConsecutiveColons(separators) => {
                let patch = insert_range(spans, separators.range());
                let rest = insert_ranges(spans, &separators.secondary);
                object::consecutive_colons(primary, rest, patch)
            }
            Self::UnknownKey {
                key,
                expected,
                primary_key,
                type_annotations_disallowed,
            } => {
                let primary_ctx = primary_key.map(|(kind, span)| (kind, insert_range(spans, span)));
                object::unknown_key(
                    primary,
                    key,
                    expected,
                    primary_ctx,
                    *type_annotations_disallowed,
                    heap,
                )
            }
            Self::ConflictingConstructor {
                existing,
                existing_range,
                found,
                allow_type,
            } => {
                let existing_span = insert_range(spans, *existing_range);
                object::conflicting_constructor(
                    existing_span,
                    primary,
                    *existing,
                    *found,
                    *allow_type,
                )
            }
            Self::DuplicateKey { first, key } => {
                let first_span = insert_range(spans, *first);
                object::duplicate_key(first_span, primary, key)
            }
            Self::OrphanedType => object::orphaned_type(primary),
            Self::StructExpectedObject { key, found } => {
                let key_span = insert_range(spans, *key);
                constructor::struct_expected_object(primary, key_span, *found)
            }
            Self::TupleExpectedArray { key, found } => {
                let key_span = insert_range(spans, *key);
                constructor::tuple_expected_array(primary, key_span, *found)
            }
            Self::ListExpectedArray { key, found } => {
                let key_span = insert_range(spans, *key);
                constructor::list_expected_array(primary, key_span, *found)
            }
            Self::DictExpectedFormat { key, found } => {
                let key_span = insert_range(spans, *key);
                constructor::dict_expected_format(primary, key_span, *found)
            }
            Self::DictEntryExpectedArray { dict_key, found } => {
                let dict_span = insert_range(spans, *dict_key);
                constructor::dict_entry_expected_array(primary, dict_span, *found)
            }
            Self::DictEntryTooFewItems { dict_key, found } => {
                let dict_span = insert_range(spans, *dict_key);
                constructor::dict_entry_too_few_items(primary, dict_span, *found)
            }
            Self::DictEntryTooManyItems { dict_key, rest } => {
                let dict_span = insert_range(spans, *dict_key);
                let rest = insert_ranges(spans, rest);
                constructor::dict_entry_too_many_items(primary, dict_span, rest)
            }
            Self::TypeExpectedString { key, found } => {
                let key_span = insert_range(spans, *key);
                constructor::type_expected_string(primary, key_span, *found)
            }
            Self::LiteralExpectedPrimitive { key, found } => {
                let key_span = insert_range(spans, *key);
                constructor::literal_expected_primitive(primary, key_span, *found)
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SyntaxErrorKind {
    Lexer(LexerErrorKind),
    ExpectedEof,
    Array(ArrayErrorKind),
    Object(ObjectErrorKind),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntaxError {
    range: TextRange,
    kind: SyntaxErrorKind,
}

impl SyntaxError {
    pub(crate) const fn new(range: TextRange, kind: SyntaxErrorKind) -> Self {
        Self { range, kind }
    }

    pub(crate) const fn kind_mut(&mut self) -> &mut SyntaxErrorKind {
        &mut self.kind
    }

    #[must_use]
    pub const fn range(&self) -> TextRange {
        self.range
    }

    #[must_use]
    pub const fn category(&self) -> JExprDiagnosticCategory {
        let parser_category = match &self.kind {
            SyntaxErrorKind::Lexer(kind) => ParserDiagnosticCategory::Lexer(kind.category()),
            SyntaxErrorKind::ExpectedEof => ParserDiagnosticCategory::ExpectedEof,
            SyntaxErrorKind::Array(kind) => ParserDiagnosticCategory::Array(kind.category()),
            SyntaxErrorKind::Object(kind) => ParserDiagnosticCategory::Object(kind.category()),
        };

        JExprDiagnosticCategory::Parser(parser_category)
    }

    fn to_diagnostic_with_heap(
        &self,
        heap: Option<&Heap>,
        spans: &mut SpanTable<Span>,
    ) -> JExprDiagnostic {
        let primary = insert_range(spans, self.range);

        match &self.kind {
            SyntaxErrorKind::Lexer(kind) => kind
                .to_diagnostic(self.range, primary, heap, spans)
                .map_category(wrap_lexer),
            SyntaxErrorKind::ExpectedEof => expected_eof(primary),
            SyntaxErrorKind::Array(kind) => kind
                .to_diagnostic(self.range, primary, spans)
                .map_category(wrap_array),
            SyntaxErrorKind::Object(kind) => kind
                .to_diagnostic(primary, heap, spans)
                .map_category(wrap_object),
        }
    }

    /// Converts this syntax error into a [`JExprDiagnostic`] backed by `spans`.
    pub fn to_diagnostic(&self, spans: &mut SpanTable<Span>) -> JExprDiagnostic {
        self.to_diagnostic_with_heap(None, spans)
    }

    pub(crate) fn to_diagnostic_in(
        &self,
        heap: &Heap,
        spans: &mut SpanTable<Span>,
    ) -> JExprDiagnostic {
        self.to_diagnostic_with_heap(Some(heap), spans)
    }
}
