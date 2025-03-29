mod combinator;
mod context;
mod error;
mod ident;

use core::ops::Range;
use std::sync::Arc;

use hashql_ast::{
    heap::Heap,
    node::{
        expr::Expr,
        id::NodeId,
        path::{Path, PathSegment},
    },
};
use hashql_core::{
    span::{SpanId, storage::SpanStorage},
    symbol::Ident,
};
use text_size::{TextRange, TextSize};
use winnow::{
    BStr, LocatingSlice, ModalResult, Parser as _, Stateful,
    combinator::{alt, opt},
    error::ParserError,
    token::{one_of, take_while},
};

use self::{combinator::separated_boxed1, context::Input, error::StringDiagnostic};
use super::state::ParserState;

fn parse_segment<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<PathSegment<'heap>, E> {
    todo!()
}

fn parse_path<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Path<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let root = opt("::").map(|value| value.is_some());
    let segments = separated_boxed1(context.heap, parse_segment, "::");

    (root, segments)
        .with_span()
        .map(|((rooted, segments), span)| Path {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            rooted,
            segments,
        })
        .parse_next(input)
}

fn parse_string<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
) -> Result<Expr<'heap>, StringDiagnostic> {
    todo!()
}
