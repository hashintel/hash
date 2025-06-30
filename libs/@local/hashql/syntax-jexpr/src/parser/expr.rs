use hashql_ast::node::expr::Expr;

use super::{
    array::parse_array,
    error::{ParserDiagnostic, ParserDiagnosticCategory},
    object::parse_object,
    state::ParserState,
    string::parse_string,
};
use crate::{
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
};

const PARSE_EXPR_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[
    SyntaxKind::String, //
    SyntaxKind::LBracket,
    SyntaxKind::LBrace,
]);

pub(crate) fn parse_expr<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<Expr<'heap>, ParserDiagnostic> {
    let token = state
        .advance(PARSE_EXPR_KINDS)
        .change_category(ParserDiagnosticCategory::Lexer)?;

    match token.kind.syntax() {
        SyntaxKind::String => {
            parse_string(state, token).change_category(ParserDiagnosticCategory::String)
        }
        SyntaxKind::LBracket => parse_array(state, token),
        SyntaxKind::LBrace => parse_object(state, token),
        SyntaxKind::Number
        | SyntaxKind::True
        | SyntaxKind::False
        | SyntaxKind::Null
        | SyntaxKind::Comma
        | SyntaxKind::Colon
        | SyntaxKind::RBrace
        | SyntaxKind::RBracket => {
            unreachable!()
        }
    }
}
