//! Diagnostic categories and syntax error records for J-Expr parsing.

use alloc::borrow::Cow;

use hashql_core::span::{SpanAncestors, SpanId, SpanTable};
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Critical,
};
use text_size::TextRange;

use crate::{span::Span, syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet};

pub(crate) mod array;
pub(crate) mod constructor;
pub(crate) mod lexer;
pub(crate) mod object;

pub use self::{
    array::ArrayDiagnosticCategory, lexer::LexerDiagnosticCategory,
    object::ObjectDiagnosticCategory,
};
pub use crate::{
    embedded::error::StringDiagnosticCategory,
    lexer::{
        LexError,
        number::{ParseNumberError, ParseNumberErrorKind},
        string::{EscapeError, StringError},
    },
};

/// Diagnostic emitted by the J-Expr frontend.
pub type JExprDiagnostic<K = Critical> = Diagnostic<JExprDiagnosticCategory, SpanId, K>;

const EXPECTED_LANGUAGE_ITEM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unexpected-token",
    name: "Unexpected token",
};

const EXPECTED_EOF: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-eof",
    name: "Unexpected token after expression",
};

/// Top-level diagnostic category for J-Expr syntax errors.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JExprDiagnosticCategory {
    /// Lexing, outer CST parsing, or embedded string parsing diagnostic.
    Parser(ParserDiagnosticCategory),
}

impl DiagnosticCategory for JExprDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("jexpr")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("J-Expr syntax")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Parser(parser) => Some(parser),
        }
    }
}

/// Parser-phase diagnostic categories across lexing, arrays, objects, and embedded strings.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ParserDiagnosticCategory {
    /// Lexer error or token mismatch.
    Lexer(LexerDiagnosticCategory),
    /// Embedded HashQL expression or type string error.
    String(StringDiagnosticCategory),
    /// Array or call-expression error.
    Array(ArrayDiagnosticCategory),
    /// Object or data-constructor error.
    Object(ObjectDiagnosticCategory),
    /// Unexpected token where a language item was required.
    ExpectedLanguageItem,
    /// Trailing tokens after a complete root expression.
    ExpectedEof,
}

impl DiagnosticCategory for ParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category)
            | Self::Object(ObjectDiagnosticCategory::Lexer(category))
            | Self::Array(ArrayDiagnosticCategory::Lexer(category)) => category.id(),
            Self::String(_)
            | Self::Array(_)
            | Self::Object(_)
            | Self::ExpectedLanguageItem
            | Self::ExpectedEof => Cow::Borrowed("parser"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category)
            | Self::Object(ObjectDiagnosticCategory::Lexer(category))
            | Self::Array(ArrayDiagnosticCategory::Lexer(category)) => category.name(),
            Self::String(_)
            | Self::Array(_)
            | Self::Object(_)
            | Self::ExpectedLanguageItem
            | Self::ExpectedEof => Cow::Borrowed("Parser"),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Lexer(category) => category.subcategory(),
            Self::String(category) => Some(category),
            Self::Array(category) => Some(category.hoist()),
            Self::Object(category) => Some(category.hoist()),
            Self::ExpectedLanguageItem => Some(&EXPECTED_LANGUAGE_ITEM),
            Self::ExpectedEof => Some(&EXPECTED_EOF),
        }
    }
}

impl From<LexerDiagnosticCategory> for ParserDiagnosticCategory {
    #[inline]
    fn from(value: LexerDiagnosticCategory) -> Self {
        Self::Lexer(value)
    }
}

impl From<StringDiagnosticCategory> for ParserDiagnosticCategory {
    #[inline]
    fn from(value: StringDiagnosticCategory) -> Self {
        Self::String(value)
    }
}

impl From<ArrayDiagnosticCategory> for ParserDiagnosticCategory {
    #[inline]
    fn from(value: ArrayDiagnosticCategory) -> Self {
        Self::Array(value)
    }
}

impl From<ObjectDiagnosticCategory> for ParserDiagnosticCategory {
    #[inline]
    fn from(value: ObjectDiagnosticCategory) -> Self {
        Self::Object(value)
    }
}

const EXPECTED_EOF_HELP: &str =
    "Remove this token or check for missing delimiters in the preceding expression";

pub(crate) fn expected_eof(span: SpanId) -> JExprDiagnostic {
    let mut diagnostic = Diagnostic::new(
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::ExpectedEof),
        Critical::ERROR,
    )
    .primary(Label::new(span, "Extra content after expression"));
    diagnostic.add_message(Message::help(EXPECTED_EOF_HELP));
    diagnostic
}

/// Detailed syntax error payload stored inside a [`SyntaxError`] during CST construction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SyntaxErrorKind {
    InvalidString(StringError),
    InvalidNumber(ParseNumberErrorKind),
    InvalidCharacter,
    UnterminatedBlockComment,
    UnexpectedEof {
        expected: SyntaxKindSet,
    },
    UnexpectedToken {
        found: SyntaxKind,
        expected: SyntaxKindSet,
    },
    ExpectedEof,

    EmptyArray,
    ArrayLeadingCommas(Vec<TextRange>),
    ArrayTrailingCommas(Vec<TextRange>),
    ArrayConsecutiveCommas(Vec<TextRange>),
    LabeledArgumentMissingPrefix {
        actual: String,
    },
    LabeledArgumentLengthMismatch {
        extra: Vec<TextRange>,
        count: usize,
    },

    EmptyObject,
    ObjectLeadingCommas(Vec<TextRange>),
    ObjectTrailingCommas(Vec<TextRange>),
    ObjectConsecutiveCommas(Vec<TextRange>),
    ObjectConsecutiveColons(Vec<TextRange>),
    UnknownKey {
        key: String,
        expected: &'static [&'static str],
    },
    DuplicateKey {
        first: TextRange,
        key: &'static str,
    },
    OrphanedType,
    StructExpectedObject {
        found: SyntaxKind,
    },
    TupleExpectedArray {
        found: SyntaxKind,
    },
    ListExpectedArray {
        found: SyntaxKind,
    },
    DictExpectedFormat {
        found: SyntaxKind,
    },
    DictEntryExpectedArray {
        found: SyntaxKind,
    },
    DictEntryTooFewItems {
        found: usize,
    },
    DictEntryTooManyItems(Vec<TextRange>),
    TypeExpectedString {
        found: SyntaxKind,
    },
    LiteralExpectedPrimitive {
        found: SyntaxKind,
    },
}

/// Syntax error recorded with source [`TextRange`] locations while building a J-Expr CST.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntaxError {
    range: TextRange,
    kind: SyntaxErrorKind,
}

impl SyntaxError {
    pub(crate) const fn new(range: TextRange, kind: SyntaxErrorKind) -> Self {
        Self { range, kind }
    }

    /// Returns the primary source byte range for this syntax error.
    #[must_use]
    pub const fn range(&self) -> TextRange {
        self.range
    }

    /// Returns the [`JExprDiagnosticCategory`] corresponding to this syntax error.
    #[must_use]
    pub const fn category(&self) -> JExprDiagnosticCategory {
        let parser_category = match &self.kind {
            SyntaxErrorKind::InvalidString(_) => {
                ParserDiagnosticCategory::Lexer(LexerDiagnosticCategory::InvalidString)
            }
            SyntaxErrorKind::InvalidNumber(_) => {
                ParserDiagnosticCategory::Lexer(LexerDiagnosticCategory::InvalidNumber)
            }
            SyntaxErrorKind::InvalidCharacter => {
                ParserDiagnosticCategory::Lexer(LexerDiagnosticCategory::InvalidCharacter)
            }
            SyntaxErrorKind::UnterminatedBlockComment => {
                ParserDiagnosticCategory::Lexer(LexerDiagnosticCategory::UnterminatedBlockComment)
            }
            SyntaxErrorKind::UnexpectedEof { .. } => {
                ParserDiagnosticCategory::Lexer(LexerDiagnosticCategory::UnexpectedEof)
            }
            SyntaxErrorKind::UnexpectedToken { .. } => {
                ParserDiagnosticCategory::Lexer(LexerDiagnosticCategory::UnexpectedToken)
            }
            SyntaxErrorKind::ExpectedEof => ParserDiagnosticCategory::ExpectedEof,
            SyntaxErrorKind::EmptyArray => {
                ParserDiagnosticCategory::Array(ArrayDiagnosticCategory::Empty)
            }
            SyntaxErrorKind::ArrayLeadingCommas(_) => {
                ParserDiagnosticCategory::Array(ArrayDiagnosticCategory::LeadingComma)
            }
            SyntaxErrorKind::ArrayTrailingCommas(_) => {
                ParserDiagnosticCategory::Array(ArrayDiagnosticCategory::TrailingComma)
            }
            SyntaxErrorKind::ArrayConsecutiveCommas(_) => {
                ParserDiagnosticCategory::Array(ArrayDiagnosticCategory::ConsecutiveComma)
            }
            SyntaxErrorKind::LabeledArgumentMissingPrefix { .. } => {
                ParserDiagnosticCategory::Array(
                    ArrayDiagnosticCategory::LabeledArgumentMissingPrefix,
                )
            }
            SyntaxErrorKind::LabeledArgumentLengthMismatch { .. } => {
                ParserDiagnosticCategory::Array(
                    ArrayDiagnosticCategory::LabeledArgumentLengthMismatch,
                )
            }
            SyntaxErrorKind::EmptyObject => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::Empty)
            }
            SyntaxErrorKind::ObjectLeadingCommas(_) => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::LeadingComma)
            }
            SyntaxErrorKind::ObjectTrailingCommas(_) => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::TrailingComma)
            }
            SyntaxErrorKind::ObjectConsecutiveCommas(_) => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::ConsecutiveComma)
            }
            SyntaxErrorKind::ObjectConsecutiveColons(_) => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::ConsecutiveColon)
            }
            SyntaxErrorKind::UnknownKey { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::UnknownKey)
            }
            SyntaxErrorKind::DuplicateKey { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::DuplicateKey)
            }
            SyntaxErrorKind::OrphanedType => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::OrphanedType)
            }
            SyntaxErrorKind::StructExpectedObject { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::StructExpectedObject)
            }
            SyntaxErrorKind::TupleExpectedArray { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::TupleExpectedArray)
            }
            SyntaxErrorKind::ListExpectedArray { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::ListExpectedArray)
            }
            SyntaxErrorKind::DictExpectedFormat { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::DictExpectedFormat)
            }
            SyntaxErrorKind::DictEntryExpectedArray { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::DictEntryExpectedArray)
            }
            SyntaxErrorKind::DictEntryTooFewItems { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::DictEntryTooFewItems)
            }
            SyntaxErrorKind::DictEntryTooManyItems(_) => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::DictEntryTooManyItems)
            }
            SyntaxErrorKind::TypeExpectedString { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::TypeExpectedString)
            }
            SyntaxErrorKind::LiteralExpectedPrimitive { .. } => {
                ParserDiagnosticCategory::Object(ObjectDiagnosticCategory::LiteralExpectedPrimitive)
            }
        };

        JExprDiagnosticCategory::Parser(parser_category)
    }

    /// Lowers this syntax error into a [`JExprDiagnostic`], registering its spans in `spans`.
    pub fn to_diagnostic(&self, spans: &mut SpanTable<Span>) -> JExprDiagnostic {
        let primary = spans.insert(Span::new(self.range), SpanAncestors::EMPTY);

        match &self.kind {
            SyntaxErrorKind::InvalidString(err) => {
                lexer::from_string_error(*err, primary).map_category(wrap_lexer)
            }
            SyntaxErrorKind::InvalidNumber(err) => {
                lexer::from_number_error(*err, primary).map_category(wrap_lexer)
            }
            SyntaxErrorKind::InvalidCharacter => {
                lexer::from_unrecognized_character_error(primary).map_category(wrap_lexer)
            }
            SyntaxErrorKind::UnterminatedBlockComment => {
                lexer::unterminated_block_comment(primary).map_category(wrap_lexer)
            }
            SyntaxErrorKind::UnexpectedEof { expected } => {
                lexer::unexpected_eof(primary, *expected).map_category(wrap_lexer)
            }
            SyntaxErrorKind::UnexpectedToken { found, expected } => {
                lexer::unexpected_token(primary, *found, *expected).map_category(wrap_lexer)
            }
            SyntaxErrorKind::ExpectedEof => expected_eof(primary),
            SyntaxErrorKind::EmptyArray => array::empty(primary).map_category(wrap_array),
            SyntaxErrorKind::ArrayLeadingCommas(rest) => {
                let rest = insert_ranges(spans, rest);
                array::leading_commas(primary, &rest).map_category(wrap_array)
            }
            SyntaxErrorKind::ArrayTrailingCommas(rest) => {
                let rest = insert_ranges(spans, rest);
                array::trailing_commas(primary, &rest).map_category(wrap_array)
            }
            SyntaxErrorKind::ArrayConsecutiveCommas(rest) => {
                let rest = insert_ranges(spans, rest);
                array::consecutive_commas(primary, &rest).map_category(wrap_array)
            }
            SyntaxErrorKind::LabeledArgumentMissingPrefix { actual } => {
                array::labeled_argument_missing_prefix(primary, actual).map_category(wrap_array)
            }
            SyntaxErrorKind::LabeledArgumentLengthMismatch { extra, count } => {
                let extra = insert_ranges(spans, extra);
                array::labeled_arguments_length_mismatch(primary, extra, *count)
                    .map_category(wrap_array)
            }
            SyntaxErrorKind::EmptyObject => object::empty(primary).map_category(wrap_object),
            SyntaxErrorKind::ObjectLeadingCommas(rest) => {
                let rest = insert_ranges(spans, rest);
                object::leading_commas(primary, &rest).map_category(wrap_object)
            }
            SyntaxErrorKind::ObjectTrailingCommas(rest) => {
                let rest = insert_ranges(spans, rest);
                object::trailing_commas(primary, &rest).map_category(wrap_object)
            }
            SyntaxErrorKind::ObjectConsecutiveCommas(rest) => {
                let rest = insert_ranges(spans, rest);
                object::consecutive_commas(primary, &rest).map_category(wrap_object)
            }
            SyntaxErrorKind::ObjectConsecutiveColons(rest) => {
                let rest = insert_ranges(spans, rest);
                object::consecutive_colons(primary, &rest).map_category(wrap_object)
            }
            SyntaxErrorKind::UnknownKey { key, expected } => {
                object::unknown_key(primary, key, expected).map_category(wrap_object)
            }
            SyntaxErrorKind::DuplicateKey { first, key } => {
                let first_span = spans.insert(Span::new(*first), SpanAncestors::EMPTY);
                object::duplicate_key(first_span, primary, key).map_category(wrap_object)
            }
            SyntaxErrorKind::OrphanedType => {
                object::orphaned_type(primary).map_category(wrap_object)
            }
            SyntaxErrorKind::StructExpectedObject { found } => {
                constructor::struct_expected_object(primary, *found).map_category(wrap_object)
            }
            SyntaxErrorKind::TupleExpectedArray { found } => {
                constructor::tuple_expected_array(primary, *found).map_category(wrap_object)
            }
            SyntaxErrorKind::ListExpectedArray { found } => {
                constructor::list_expected_array(primary, *found).map_category(wrap_object)
            }
            SyntaxErrorKind::DictExpectedFormat { found } => {
                constructor::dict_expected_format(primary, *found).map_category(wrap_object)
            }
            SyntaxErrorKind::DictEntryExpectedArray { found } => {
                constructor::dict_entry_expected_array(primary, *found).map_category(wrap_object)
            }
            SyntaxErrorKind::DictEntryTooFewItems { found } => {
                constructor::dict_entry_too_few_items(primary, *found).map_category(wrap_object)
            }
            SyntaxErrorKind::DictEntryTooManyItems(rest) => {
                let rest = insert_ranges(spans, rest);
                constructor::dict_entry_too_many_items(primary, &rest).map_category(wrap_object)
            }
            SyntaxErrorKind::TypeExpectedString { found } => {
                constructor::type_expected_string(primary, *found).map_category(wrap_object)
            }
            SyntaxErrorKind::LiteralExpectedPrimitive { found } => {
                constructor::literal_expected_primitive(primary, *found).map_category(wrap_object)
            }
        }
    }
}

fn insert_ranges(spans: &mut SpanTable<Span>, ranges: &[TextRange]) -> Vec<SpanId> {
    ranges
        .iter()
        .map(|&range| spans.insert(Span::new(range), SpanAncestors::EMPTY))
        .collect()
}

const fn wrap_lexer(category: LexerDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(category))
}

const fn wrap_array(category: ArrayDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Array(category))
}

const fn wrap_object(category: ObjectDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(category))
}
