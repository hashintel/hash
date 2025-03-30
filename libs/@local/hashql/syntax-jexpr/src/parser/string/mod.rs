mod combinator;
mod context;
mod error;
mod expr;
mod generic;
mod ident;
mod path;
#[cfg(test)]
pub(crate) mod test;
mod r#type;

use hashql_ast::node::expr::Expr;

use self::{context::Context, error::StringDiagnostic};
use super::state::ParserState;
use crate::{
    lexer::{syntax_kind::SyntaxKind, token::Token},
    span::Span,
};

fn parse_string<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
    token: &Token<'source>,
) -> Result<Expr<'heap>, StringDiagnostic> {
    debug_assert_eq!(token.kind.syntax(), SyntaxKind::String);

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

    todo!()
}
