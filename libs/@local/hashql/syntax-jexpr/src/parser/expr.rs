use hashql_ast::node::expr::Expr;

use super::{
    error::{ParserDiagnostic, ParserDiagnosticCategory, unexpected_token},
    state::ParserState,
    string::parse_string,
};
use crate::{
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
    span::Span,
};

const PARSE_EXPR_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[
    SyntaxKind::String, //
    SyntaxKind::LBracket,
    SyntaxKind::LBrace,
]);

pub(crate) fn parse_expr<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
) -> Result<Expr<'heap>, ParserDiagnostic> {
    let token = state
        .advance()
        .change_category(ParserDiagnosticCategory::Lexer)?;

    match token.kind.syntax() {
        SyntaxKind::String => {
            parse_string(state, token).change_category(ParserDiagnosticCategory::String)
        }
        SyntaxKind::LBracket => todo!("parse function call"),
        SyntaxKind::LBrace => todo!("parse objects"),
        _ => {
            let span = state.insert_span(Span {
                range: token.span,
                pointer: Some(state.current_pointer()),
                parent_id: None,
            });

            Err(unexpected_token(
                span,
                ParserDiagnosticCategory::ExpectedLanguageItem,
                PARSE_EXPR_KINDS,
            ))
        }
    }
}
