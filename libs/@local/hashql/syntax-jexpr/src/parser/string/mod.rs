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
use hashql_core::{span::SpanId, symbol::Ident};
use winnow::{
    LocatingSlice, ModalParser, Stateful,
    error::{ContextError, ParseError},
    stream::{Offset, Stream, StreamIsPartial},
};

use self::{
    context::Context,
    error::{StringDiagnostic, invalid_expr},
    expr::parse_expr,
    ident::{parse_ident, parse_ident_labelled_argument},
    r#type::parse_type,
};
use super::state::ParserState;
use crate::{
    lexer::{token::Token, token_kind::TokenKind},
    span::Span,
};

type InputStream<'heap, 'span, I> = Stateful<LocatingSlice<I>, Context<'heap, 'span>>;

fn parse_from_string<'heap, 'spans, I, O>(
    mut parser: impl ModalParser<InputStream<'heap, 'spans, I>, O, ContextError>,
    state: &'spans mut ParserState<'heap, '_, '_>,
    parent: SpanId,
    input: I,
) -> Result<O, ParseError<InputStream<'heap, 'spans, I>, ContextError>>
where
    I: Stream + StreamIsPartial + Offset + Clone,
{
    let context = Context {
        heap: state.heap(),
        spans: state.spans(),
        parent,
    };

    parser.parse(Stateful {
        input: LocatingSlice::new(input),
        state: context,
    })
}

pub(crate) fn parse_expr_from_string<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
    parent: SpanId,
    value: &str,
) -> Result<Expr<'heap>, StringDiagnostic> {
    let expr = parse_from_string(parse_expr, state, parent, value);

    match expr {
        Ok(expr) => Ok(expr),
        Err(error) => {
            // We need to destructure here instead of in the error so that we can mutably borrow the
            // span table
            let error = (error.offset(), error.into_inner());

            Err(invalid_expr(state.spans(), parent, error))
        }
    }
}

#[expect(
    clippy::panic_in_result_fn,
    reason = "If this happened, the contract with the function has been violated, therefore is \
              fatal"
)]
pub(crate) fn parse_string<'heap, 'source>(
    state: &mut ParserState<'heap, 'source, '_>,
    token: Token<'source>,
) -> Result<Expr<'heap>, StringDiagnostic> {
    let TokenKind::String(value) = token.kind else {
        panic!("Expected string token")
    };

    let id = state.insert_span(Span {
        range: token.span,
        pointer: Some(state.current_pointer()),
    });

    parse_expr_from_string(state, id, &value)
}

pub(crate) fn parse_type_from_string<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
    parent: SpanId,
    value: &str,
) -> Result<Type<'heap>, StringDiagnostic> {
    let expr = parse_from_string(parse_type, state, parent, value);

    match expr {
        Ok(expr) => Ok(expr),
        Err(error) => {
            let error = (error.offset(), error.into_inner());

            Err(invalid_expr(state.spans(), parent, error))
        }
    }
}

#[expect(
    clippy::panic_in_result_fn,
    reason = "If this happened, the contract with the function has been violated, therefore is \
              fatal"
)]
pub(crate) fn parse_type_from_token<'heap, 'source>(
    state: &mut ParserState<'heap, 'source, '_>,
    token: Token<'source>,
) -> Result<Type<'heap>, StringDiagnostic> {
    let TokenKind::String(value) = token.kind else {
        panic!("Expected string token")
    };

    let id = state.insert_span(Span {
        range: token.span,
        pointer: Some(state.current_pointer()),
    });

    parse_type_from_string(state, id, &value)
}

pub(crate) fn parse_ident_from_string<'heap, 'spans, 'input>(
    state: &'spans mut ParserState<'heap, '_, '_>,
    parent: SpanId,
    value: &'input str,
) -> Result<Ident<'heap>, ParseError<InputStream<'heap, 'spans, &'input str>, ContextError>> {
    parse_from_string(parse_ident, state, parent, value)
}

pub(crate) fn parse_ident_labelled_argument_from_string<'heap, 'spans, 'input>(
    state: &'spans mut ParserState<'heap, '_, '_>,
    parent: SpanId,
    value: &'input str,
) -> Result<Ident<'heap>, ParseError<InputStream<'heap, 'spans, &'input str>, ContextError>> {
    parse_from_string(parse_ident_labelled_argument, state, parent, value)
}
