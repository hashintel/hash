use alloc::borrow::Cow;

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

use crate::{span::Span, syntax_kind::SyntaxKind};

pub(crate) mod array;
pub(crate) mod constructor;
pub(crate) mod lexer;
pub(crate) mod number;
pub(crate) mod object;
pub(crate) mod string;
mod syntax;
#[cfg(test)]
mod tests;

pub(crate) use self::syntax::{ArrayErrorKind, LexerErrorKind, ObjectErrorKind, SyntaxErrorKind};
pub use self::{
    array::ArrayDiagnosticCategory, lexer::LexerDiagnosticCategory,
    object::ObjectDiagnosticCategory, syntax::SyntaxError,
};
pub use crate::{
    embedded::error::StringDiagnosticCategory,
    lexer::{
        LexError,
        number::{ParseNumberError, ParseNumberErrorKind},
        string::{EscapeError, StringError},
    },
};

const EXPECTED_EOF: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "expected-eof",
    name: "Unexpected token after expression",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ParserDiagnosticCategory {
    Lexer(LexerDiagnosticCategory),
    /// Embedded HashQL expression or type string error.
    String(StringDiagnosticCategory),
    Array(ArrayDiagnosticCategory),
    Object(ObjectDiagnosticCategory),
    ExpectedEof,
}

impl DiagnosticCategory for ParserDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.id(),
            Self::String(_) | Self::Array(_) | Self::Object(_) | Self::ExpectedEof => {
                Cow::Borrowed("parser")
            }
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Lexer(category) => category.name(),
            Self::String(_) | Self::Array(_) | Self::Object(_) | Self::ExpectedEof => {
                Cow::Borrowed("Parser")
            }
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Lexer(category) => category.subcategory(),
            Self::String(category) => Some(category),
            Self::Array(category) => Some(category),
            Self::Object(category) => Some(category),
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JExprDiagnosticCategory {
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

/// J-Expr constructor or annotation field name used in contextual object diagnostics.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ConstructorKind {
    Literal,
    Struct,
    Tuple,
    List,
    Dict,
    Type,
}

impl ConstructorKind {
    pub(crate) const fn key(self) -> &'static str {
        match self {
            Self::Literal => "#literal",
            Self::Struct => "#struct",
            Self::Tuple => "#tuple",
            Self::List => "#list",
            Self::Dict => "#dict",
            Self::Type => "#type",
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
pub(crate) struct StringErrorContext {
    pub open_quote: TextRange,
    pub control_byte: Option<u8>,
    pub high_surrogate: Option<TextRange>,
    pub invalid_unit: Option<u16>,
}

/// Syntactic context at an unexpected end of input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum EofContext {
    Document,
    FieldColon {
        key: TextRange,
    },
    FieldValue {
        key: TextRange,
        constructor: Option<ConstructorKind>,
    },
    UnclosedDelimiters(Vec<(DelimiterKind, TextRange)>),
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
    BarePrimitiveInExpr {
        text: String,
    },
    ObjectKey,
}

pub(crate) fn expected_eof(span: SpanId) -> JExprDiagnostic {
    let mut diagnostic = Diagnostic::new(
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::ExpectedEof),
        Critical::ERROR,
    )
    .primary(Label::new(
        span,
        "unexpected trailing content after expression",
    ));

    diagnostic.add_message(Message::help(
        "remove the trailing content, or check for an extra closing delimiter in the preceding \
         expression",
    ));
    diagnostic.add_message(Message::note(
        "a J-Expr document must contain a single top-level expression",
    ));
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

fn suggest_similar_in(
    lookup: &str,
    candidates: &[&'static str],
    heap: &Heap,
    top_n: usize,
) -> Vec<&'static str> {
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

/// Returns similar candidate strings ordered by similarity using [`did_you_mean`].
pub(crate) fn suggest_similar(
    lookup: &str,
    candidates: &[&'static str],
    heap: Option<&Heap>,
    top_n: usize,
) -> Vec<&'static str> {
    if candidates.is_empty() {
        return Vec::new();
    }

    heap.map_or_else(
        || suggest_similar_in(lookup, candidates, &Heap::with_capacity(512), top_n),
        |heap| suggest_similar_in(lookup, candidates, heap, top_n),
    )
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
