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

use hashql_ast::node::expr::Expr;
use winnow::{LocatingSlice, Parser as _, Stateful, error::ContextError};

use self::{context::Context, error::StringDiagnostic, expr::parse_expr};
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
    state: &mut ParserState<'heap, 'source>,
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

    let context = Context {
        heap: state.heap(),
        spans: state.spans(),
        parent: id,
    };

    let expr = parse_expr::<ContextError>.parse(Stateful {
        input: LocatingSlice::new(&value),
        state: context,
    });

    todo!()
}
