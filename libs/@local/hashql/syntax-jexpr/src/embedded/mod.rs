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

use core::alloc::Allocator;

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
};

use self::{
    context::Context,
    error::{StringDiagnostic, invalid_expr_in, invalid_type_in},
    expr::parse_expr,
    ident::{parse_ident, parse_ident_labelled_argument},
    r#type::parse_type,
};
use crate::{ParserOptions, lexer::RawOffsets, span::Span};

type InputStream<'heap, 'spans, I, A> = Stateful<LocatingSlice<I>, Context<'heap, 'spans, A>>;

#[derive(Copy, Clone)]
pub(crate) struct EmbeddedString<'input> {
    pub parent: SpanId,
    pub raw_quoted: &'input str,
    pub decoded: &'input str,
}

fn parse_from_string_in<'heap, 'spans, 'input, O, A>(
    mut parser: impl ModalParser<InputStream<'heap, 'spans, &'input str, A>, O, ContextError>,
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    options: ParserOptions,
    EmbeddedString {
        parent,
        raw_quoted,
        decoded,
    }: EmbeddedString<'input>,
    alloc: A,
) -> Result<O, ParseError<InputStream<'heap, 'spans, &'input str, A>, ContextError>>
where
    A: Allocator + Clone,
{
    let context = Context {
        heap,
        spans,
        parent,
        offsets: RawOffsets::new_in(raw_quoted, alloc),
        depth: 0,
        options,
    };

    parser.parse(Stateful {
        input: LocatingSlice::new(decoded),
        state: context,
    })
}

/// Parses a decoded string body into an embedded HashQL expression.
///
/// Covers paths, field and index accesses, and underscore expressions.
pub(crate) fn parse_expr_from_string_in<'heap, A>(
    heap: &'heap Heap,
    spans: &mut SpanTable<Span>,
    options: ParserOptions,
    string: EmbeddedString<'_>,
    alloc: A,
) -> Result<Expr<'heap>, StringDiagnostic>
where
    A: Allocator + Clone,
{
    match parse_from_string_in(parse_expr, heap, spans, options, string, alloc.clone()) {
        Ok(expr) => Ok(expr),
        Err(error) => {
            let error = (error.offset(), error.into_inner());
            Err(invalid_expr_in(spans, options, string, error, alloc))
        }
    }
}

/// Parses a decoded `"#type"` string body into a HashQL [`Type`].
pub(crate) fn parse_type_from_string_in<'heap, A>(
    heap: &'heap Heap,
    spans: &mut SpanTable<Span>,
    options: ParserOptions,
    key_range: Option<TextRange>,
    string: EmbeddedString<'_>,
    alloc: A,
) -> Result<Type<'heap>, StringDiagnostic>
where
    A: Allocator + Clone,
{
    match parse_from_string_in(parse_type, heap, spans, options, string, alloc.clone()) {
        Ok(r#type) => Ok(r#type),
        Err(error) => {
            let error = (error.offset(), error.into_inner());
            let key_span =
                key_range.map(|range| spans.insert(Span::new(range), SpanAncestors::EMPTY));
            Err(invalid_type_in(
                spans, options, key_span, string, error, alloc,
            ))
        }
    }
}

/// Parses a decoded `#struct` field key into a HashQL [`Ident`].
pub(crate) fn parse_ident_from_string_in<'heap, 'spans, 'input, A>(
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    options: ParserOptions,
    string: EmbeddedString<'input>,
    alloc: A,
) -> Result<Ident<'heap>, ParseError<InputStream<'heap, 'spans, &'input str, A>, ContextError>>
where
    A: Allocator + Clone,
{
    parse_from_string_in(parse_ident, heap, spans, options, string, alloc)
}

/// Parses a decoded `:label` string into a HashQL [`Ident`].
pub(crate) fn parse_ident_labelled_argument_from_string_in<'heap, 'spans, 'input, A>(
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    options: ParserOptions,
    string: EmbeddedString<'input>,
    alloc: A,
) -> Result<Ident<'heap>, ParseError<InputStream<'heap, 'spans, &'input str, A>, ContextError>>
where
    A: Allocator + Clone,
{
    parse_from_string_in(
        parse_ident_labelled_argument,
        heap,
        spans,
        options,
        string,
        alloc,
    )
}
