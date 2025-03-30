mod error;
mod visit;

use hashql_ast::node::expr::Expr;

use self::error::ArrayDiagnostic;
use crate::{
    lexer::{syntax_kind::SyntaxKind, token::Token},
    parser::state::ParserState,
};

#[expect(
    clippy::panic_in_result_fn,
    reason = "If this happened, the contract with the function has been violated, therefore is \
              fatal"
)]
pub(crate) fn parse_array<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
    token: Token<'source>,
) -> Result<Expr<'heap>, ArrayDiagnostic> {
    debug_assert_eq!(token.kind.syntax(), SyntaxKind::LBracket);

    todo!()
}
