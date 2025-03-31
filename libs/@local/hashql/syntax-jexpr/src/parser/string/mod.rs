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
use winnow::{LocatingSlice, Parser as _, Stateful, error::ContextError};

use self::{
    context::Context,
    error::{StringDiagnostic, invalid_expr},
    expr::parse_expr,
    r#type::parse_type,
};
use super::state::ParserState;
use crate::{
    lexer::{token::Token, token_kind::TokenKind},
    span::Span,
};

#[expect(
    clippy::panic_in_result_fn,
    reason = "If this happened, the contract with the function has been violated, therefore is \
              fatal"
)]
pub(crate) fn parse_string<'heap, 'source>(
    state: &ParserState<'heap, 'source>,
    token: Token<'source>,
) -> Result<Expr<'heap>, StringDiagnostic> {
    let TokenKind::String(value) = token.kind else {
        panic!("Expected string token")
    };

    let id = state.insert_span(Span {
        range: token.span,
        pointer: Some(state.current_pointer()),
        parent_id: None,
    });

    let expr = {
        let context = Context {
            heap: state.heap(),
            spans: state.spans(),
            parent: id,
        };

        parse_expr::<ContextError>.parse(Stateful {
            input: LocatingSlice::new(&value),
            state: context,
        })
    };

    match expr {
        Ok(expr) => Ok(expr),
        Err(error) => Err(invalid_expr(state.spans(), id, error)),
    }
}

#[expect(
    clippy::panic_in_result_fn,
    reason = "If this happened, the contract with the function has been violated, therefore is \
              fatal"
)]
pub(crate) fn parse_string_type<'heap, 'source>(
    state: &ParserState<'heap, 'source>,
    token: Token<'source>,
) -> Result<Type<'heap>, StringDiagnostic> {
    let TokenKind::String(value) = token.kind else {
        panic!("Expected string token")
    };

    let id = state.insert_span(Span {
        range: token.span,
        pointer: Some(state.current_pointer()),
        parent_id: None,
    });

    let r#type = {
        let context = Context {
            heap: state.heap(),
            spans: state.spans(),
            parent: id,
        };

        parse_type::<ContextError>.parse(Stateful {
            input: LocatingSlice::new(&value),
            state: context,
        })
    };

    match r#type {
        Ok(r#type) => Ok(r#type),
        Err(error) => Err(invalid_expr(state.spans(), id, error)),
    }
}
