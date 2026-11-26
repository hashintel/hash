use alloc::borrow::Cow;
use core::alloc::Allocator;

use hashql_core::{
    algorithms::did_you_mean,
    heap::Heap,
    span::{SpanAncestors, SpanId, SpanTable},
};
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Critical,
};
use text_size::{TextRange, TextSize};

use crate::{
    span::Span,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

pub(crate) mod array;
pub(crate) mod constructor;
pub(crate) mod lexer;
pub(crate) mod number;
pub(crate) mod object;
pub(crate) mod string;
mod syntax;
#[cfg(test)]
mod tests;

pub(crate) use self::syntax::{
    ArrayErrorKind, LexerErrorKind, ObjectErrorKind, SyntaxError, SyntaxErrorKind,
};
pub use self::{
    array::ArrayDiagnosticCategory, lexer::LexerDiagnosticCategory,
    object::ObjectDiagnosticCategory,
};
pub use crate::embedded::error::StringDiagnosticCategory;
pub(crate) use crate::lexer::string::StringError;

const EXPECTED_EOF: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-eof",
    name: "Unexpected trailing content",
};

const NESTING_LIMIT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "nesting-limit",
    name: "Nesting limit exceeded",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ParserDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    /// Embedded HashQL expression or type string error.
    String(StringDiagnosticCategory),
    Array(ArrayDiagnosticCategory),
    Object(ObjectDiagnosticCategory),
    ExpectedEof,
    NestingLimit,
}

impl DiagnosticCategory for ParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.id(),
            Self::String(_)
            | Self::Array(_)
            | Self::Object(_)
            | Self::ExpectedEof
            | Self::NestingLimit => Cow::Borrowed("parser"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.name(),
            Self::String(_)
            | Self::Array(_)
            | Self::Object(_)
            | Self::ExpectedEof
            | Self::NestingLimit => Cow::Borrowed("Parser"),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Lexer(category) => category.subcategory(),
            Self::String(category) => Some(category),
            Self::Array(category) => Some(category),
            Self::Object(category) => Some(category),
            Self::ExpectedEof => Some(&EXPECTED_EOF),
            Self::NestingLimit => Some(&NESTING_LIMIT),
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JExprDiagnosticCategory {
    Parser(ParserDiagnosticCategory),
}

impl JExprDiagnosticCategory {
    pub(crate) const fn string(category: StringDiagnosticCategory) -> Self {
        Self::Parser(ParserDiagnosticCategory::String(category))
    }

    pub(crate) const fn array(category: ArrayDiagnosticCategory) -> Self {
        Self::Parser(ParserDiagnosticCategory::Array(category))
    }

    pub(crate) const fn object(category: ObjectDiagnosticCategory) -> Self {
        Self::Parser(ParserDiagnosticCategory::Object(category))
    }
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

pub type JExprDiagnostic<K = Critical> = Diagnostic<JExprDiagnosticCategory, SpanId, K>;

/// High-level JSON value shape used for constructor mismatch diagnostics.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ValueKind {
    String,
    Number,
    Boolean,
    Null,
    Object,
    Array,
}

impl ValueKind {
    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only JSON value starter tokens map to a ValueKind"
    )]
    pub(crate) const fn from_syntax_kind(kind: SyntaxKind) -> Option<Self> {
        match kind {
            SyntaxKind::String => Some(Self::String),
            SyntaxKind::Number => Some(Self::Number),
            SyntaxKind::True | SyntaxKind::False => Some(Self::Boolean),
            SyntaxKind::Null => Some(Self::Null),
            SyntaxKind::LBrace => Some(Self::Object),
            SyntaxKind::LBracket => Some(Self::Array),
            _ => None,
        }
    }

    pub(crate) const fn article_phrase(self) -> &'static str {
        match self {
            Self::String => "a string",
            Self::Number => "a number",
            Self::Boolean => "a boolean",
            Self::Null => "`null`",
            Self::Object => "an object",
            Self::Array => "an array",
        }
    }
}

/// J-Expr primary constructor kind.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ConstructorKind {
    Literal,
    Struct,
    Tuple,
    List,
    Dict,
}

impl ConstructorKind {
    pub(crate) fn from_key(key: &str) -> Option<Self> {
        match key {
            "#literal" => Some(Self::Literal),
            "#struct" => Some(Self::Struct),
            "#tuple" => Some(Self::Tuple),
            "#list" => Some(Self::List),
            "#dict" => Some(Self::Dict),
            _ => None,
        }
    }

    pub(crate) const fn key(self) -> &'static str {
        match self {
            Self::Literal => "#literal",
            Self::Struct => "#struct",
            Self::Tuple => "#tuple",
            Self::List => "#list",
            Self::Dict => "#dict",
        }
    }

    pub(crate) const fn node_kind(self) -> SyntaxKind {
        match self {
            Self::Literal => SyntaxKind::Literal,
            Self::Struct => SyntaxKind::Struct,
            Self::Tuple => SyntaxKind::Tuple,
            Self::List => SyntaxKind::List,
            Self::Dict => SyntaxKind::Dict,
        }
    }

    pub(crate) const fn field_kind(self) -> SyntaxKind {
        match self {
            Self::Literal => SyntaxKind::LiteralField,
            Self::Struct => SyntaxKind::StructField,
            Self::Tuple => SyntaxKind::TupleField,
            Self::List => SyntaxKind::ListField,
            Self::Dict => SyntaxKind::DictField,
        }
    }

    pub(crate) const fn expected_value(self) -> SyntaxKindSet {
        match self {
            Self::Literal => SyntaxKindSet::VALUE,
            Self::Struct => SyntaxKindSet::from_kind(T!['{']),
            Self::Tuple | Self::List => SyntaxKindSet::from_kind(T!['[']),
            Self::Dict => SyntaxKindSet::OPENING_DELIMITER,
        }
    }
}

/// J-Expr object field kind, either a primary constructor or a `#type` annotation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum FieldKind {
    Constructor(ConstructorKind),
    Type,
}

impl FieldKind {
    pub(crate) const fn key(self) -> &'static str {
        match self {
            Self::Constructor(kind) => kind.key(),
            Self::Type => "#type",
        }
    }

    pub(crate) const fn syntax_kind(self) -> SyntaxKind {
        match self {
            Self::Constructor(kind) => kind.field_kind(),
            Self::Type => SyntaxKind::TypeField,
        }
    }

    pub(crate) const fn expected_value(self) -> SyntaxKindSet {
        match self {
            Self::Constructor(kind) => kind.expected_value(),
            Self::Type => SyntaxKindSet::from_kind(T![string]),
        }
    }
}

/// Pair of matching container delimiters tracked for unclosed and mismatched delimiter diagnostics.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum DelimiterKind {
    Brace,
    Bracket,
}

impl DelimiterKind {
    pub(crate) const fn open_str(self) -> &'static str {
        match self {
            Self::Brace => "{",
            Self::Bracket => "[",
        }
    }

    pub(crate) const fn close_str(self) -> &'static str {
        match self {
            Self::Brace => "}",
            Self::Bracket => "]",
        }
    }

    pub(crate) const fn close_kind(self) -> SyntaxKind {
        match self {
            Self::Brace => SyntaxKind::RBrace,
            Self::Bracket => SyntaxKind::RBracket,
        }
    }
}

/// Additional source context captured for lexical string failures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct StringErrorContext<A: Allocator> {
    pub open_quote: TextRange,
    pub control_byte: Option<u8>,
    pub high_surrogate: Option<TextRange>,
    pub invalid_unit: Option<u16>,
    pub unclosed: Vec<(DelimiterKind, TextRange), A>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct UnclosedDelimiters<A: Allocator> {
    pub open: Vec<(DelimiterKind, TextRange), A>,
    pub close_at: TextRange,
}

/// Syntactic context at an unexpected end of input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum EofContext<A: Allocator> {
    Document,
    FieldColon {
        key: TextRange,
    },
    FieldValue {
        key: TextRange,
        field: Option<FieldKind>,
    },
    UnclosedDelimiters(UnclosedDelimiters<A>),
}

/// Grammar flavor that determines diagnostic wording and suggestions.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum GrammarKind {
    Expr,
    Value,
}

/// Syntactic context at an unexpected token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum UnexpectedTokenContext {
    General,
    MismatchedDelimiter {
        open: TextRange,
        expected_close: DelimiterKind,
    },
    MissingComma {
        after: TextSize,
        container: DelimiterKind,
    },
    MissingColon {
        key: TextRange,
    },
    MissingFieldValue {
        key: TextRange,
    },
    BarePrimitive {
        text: String,
    },
    ArrayInValue,
    ObjectKey,
}

pub(crate) fn expected_eof(span: SpanId, grammar: GrammarKind) -> JExprDiagnostic {
    let (label, help, note) = match grammar {
        GrammarKind::Expr => (
            "unexpected trailing content after expression",
            "remove the trailing content, or check for an extra closing delimiter in the \
             preceding expression",
            "a J-Expr document must contain a single top-level expression",
        ),
        GrammarKind::Value => (
            "unexpected trailing content after value",
            "remove the trailing content, or check for an extra closing delimiter in the \
             preceding value",
            "a J-Expr value document must contain a single top-level value",
        ),
    };

    let mut diagnostic = Diagnostic::new(
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::ExpectedEof),
        Critical::ERROR,
    )
    .primary(Label::new(span, label));

    diagnostic.add_message(Message::help(help));
    diagnostic.add_message(Message::note(note));
    diagnostic
}

pub(crate) fn nesting_limit(span: SpanId, limit: u16, grammar: GrammarKind) -> JExprDiagnostic {
    let mut diagnostic = Diagnostic::new(
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::NestingLimit),
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        format!("nested more than {limit} levels deep"),
    ));

    match grammar {
        GrammarKind::Expr => {
            diagnostic.add_message(Message::help(
                "reduce the nesting, for example by binding an inner expression with `let` and \
                 referring to it by name",
            ));
            diagnostic.add_message(Message::note(format!(
                "a J-Expr document nests values at most {limit} levels deep"
            )));
        }
        GrammarKind::Value => {
            diagnostic.add_message(Message::help(format!(
                "flatten or simplify the nested structure to at most {limit} levels"
            )));
            diagnostic.add_message(Message::note(format!(
                "a J-Expr value nests at most {limit} levels deep"
            )));
        }
    }

    diagnostic
}

pub(crate) fn insert_range(spans: &mut SpanTable<Span>, range: TextRange) -> SpanId {
    spans.insert(Span::new(range), SpanAncestors::EMPTY)
}

pub(crate) fn insert_ranges(
    spans: &mut SpanTable<Span>,
    ranges: &[TextRange],
) -> impl IntoIterator<Item = SpanId, IntoIter: ExactSizeIterator> {
    ranges.iter().map(|&range| insert_range(spans, range))
}

const MIN_SIMILAR_LEN: usize = 3;

pub(crate) fn suggest_similar(
    lookup: &str,
    candidates: &[&'static str],
    heap: &Heap,
    top_n: usize,
) -> Vec<&'static str> {
    if lookup.len() < MIN_SIMILAR_LEN {
        return Vec::new();
    }

    let lookup_sym = heap.intern_symbol(lookup);
    let interned: Vec<_> = candidates
        .iter()
        .map(|candidate| heap.intern_symbol(candidate))
        .collect();

    did_you_mean(lookup_sym, &interned, Some(top_n), None)
        .into_iter()
        .filter_map(|matched| {
            candidates
                .iter()
                .copied()
                .find(|&candidate| candidate == matched.as_str())
        })
        .collect()
}

/// Formats a list of code items as backticked prose with `or` before the final item.
pub(crate) fn format_backticked_or_list(items: &[&str]) -> String {
    let mut list = String::new();
    for (index, item) in items.iter().enumerate() {
        if index > 0 {
            if items.len() == 2 {
                list.push_str(" or ");
            } else if index == items.len() - 1 {
                list.push_str(", or ");
            } else {
                list.push_str(", ");
            }
        }
        list.push('`');
        list.push_str(item);
        list.push('`');
    }
    list
}

pub(crate) const fn wrap_lexer(category: LexerDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(category))
}

pub(crate) const fn wrap_array(category: ArrayDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Array(category))
}

pub(crate) const fn wrap_object(category: ObjectDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(category))
}
