//! Embedded HashQL expression, type, and identifier parsers for JSON string contents.

mod combinator;
mod context;
pub(crate) mod error;
mod expr;
mod generic;
mod ident;
mod path;
#[cfg(test)]
pub(crate) mod test;
mod r#type;

use hashql_ast::node::{expr::Expr, r#type::Type};
use hashql_core::{
    heap::Heap,
    span::{SpanAncestors, SpanId, SpanTable},
    symbol::Ident,
};
use text_size::TextRange;
use winnow::{
    LocatingSlice, ModalParser, Stateful,
    error::{ContextError, ParseError},
    stream::{Offset, Stream, StreamIsPartial},
};

use self::{
    context::Context,
    error::{StringDiagnostic, invalid_expr, invalid_type},
    expr::parse_expr,
    ident::{parse_ident, parse_ident_labelled_argument},
    r#type::parse_type,
};
use crate::{lexer::RawOffsets, span::Span};

type InputStream<'heap, 'spans, I> = Stateful<LocatingSlice<I>, Context<'heap, 'spans>>;

fn parse_from_string<'heap, 'spans, I, O>(
    mut parser: impl ModalParser<InputStream<'heap, 'spans, I>, O, ContextError>,
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    parent: SpanId,
    raw_quoted: &str,
    input: I,
) -> Result<O, ParseError<InputStream<'heap, 'spans, I>, ContextError>>
where
    I: Stream + StreamIsPartial + Offset + Clone,
{
    let context = Context {
        heap,
        spans,
        parent,
        offsets: RawOffsets::new(raw_quoted),
        depth: 0,
    };

    parser.parse(Stateful {
        input: LocatingSlice::new(input),
        state: context,
    })
}

/// Parses a decoded string body into an embedded HashQL expression.
///
/// Covers paths, field and index accesses, and underscore expressions.
pub(crate) fn parse_expr_from_string<'heap>(
    heap: &'heap Heap,
    spans: &mut SpanTable<Span>,
    parent: SpanId,
    raw_quoted: &str,
    value: &str,
) -> Result<Expr<'heap>, StringDiagnostic> {
    match parse_from_string(parse_expr, heap, spans, parent, raw_quoted, value) {
        Ok(expr) => Ok(expr),
        Err(error) => {
            let error = (error.offset(), error.into_inner());
            Err(invalid_expr(spans, parent, raw_quoted, value, error))
        }
    }
}

/// Parses a decoded `"#type"` string body into a HashQL [`Type`].
pub(crate) fn parse_type_from_string<'heap>(
    heap: &'heap Heap,
    spans: &mut SpanTable<Span>,
    parent: SpanId,
    key_range: Option<TextRange>,
    raw_quoted: &str,
    value: &str,
) -> Result<Type<'heap>, StringDiagnostic> {
    match parse_from_string(parse_type, heap, spans, parent, raw_quoted, value) {
        Ok(r#type) => Ok(r#type),
        Err(error) => {
            let error = (error.offset(), error.into_inner());
            let key_span =
                key_range.map(|range| spans.insert(Span::new(range), SpanAncestors::EMPTY));
            Err(invalid_type(
                spans, parent, key_span, raw_quoted, value, error,
            ))
        }
    }
}

/// Parses a decoded `#struct` field key into a HashQL [`Ident`].
pub(crate) fn parse_ident_from_string<'heap, 'spans, 'input>(
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    parent: SpanId,
    raw_quoted: &str,
    value: &'input str,
) -> Result<Ident<'heap>, ParseError<InputStream<'heap, 'spans, &'input str>, ContextError>> {
    parse_from_string(parse_ident, heap, spans, parent, raw_quoted, value)
}

/// Parses a decoded `:label` string into a HashQL [`Ident`].
pub(crate) fn parse_ident_labelled_argument_from_string<'heap, 'spans, 'input>(
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    parent: SpanId,
    raw_quoted: &str,
    value: &'input str,
) -> Result<Ident<'heap>, ParseError<InputStream<'heap, 'spans, &'input str>, ContextError>> {
    parse_from_string(
        parse_ident_labelled_argument,
        heap,
        spans,
        parent,
        raw_quoted,
        value,
    )
}
