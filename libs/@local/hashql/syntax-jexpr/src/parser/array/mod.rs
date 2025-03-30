pub(crate) mod error;
mod visit;

use hashql_ast::node::{
    expr::{CallExpr, Expr, ExprKind, call::Argument},
    id::NodeId,
};

use self::{error::empty, visit::visit_array};
use super::error::ParserDiagnostic;
use crate::{
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, token::Token},
    parser::{expr::parse_expr, state::ParserState},
    span::Span,
};

pub(crate) fn parse_array<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
    token: Token<'source>,
) -> Result<Expr<'heap>, ParserDiagnostic> {
    debug_assert_eq!(token.kind.syntax(), SyntaxKind::LBracket);

    let mut function = None;
    let mut arguments = Vec::new();

    let span = visit_array(state, token, |state| {
        // TODO: support for labeled arguments
        let expr = parse_expr(state)?;

        match &mut function {
            Some(_) => arguments.push(Argument {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                value: expr,
            }),
            function @ None => *function = Some(expr),
        }

        Ok(())
    })
    .change_category(From::from)?;

    let span = state.insert_span(Span {
        range: span,
        pointer: Some(state.current_pointer()),
        parent_id: None,
    });

    let Some(function) = function else {
        return Err(empty(span).map_category(From::from));
    };

    let heap = state.heap();

    Ok(Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Call(CallExpr {
            id: NodeId::PLACEHOLDER,
            span,
            function: heap.boxed(function),
            arguments: heap.boxed_slice(arguments),
            // TODO:
            labeled_arguments: heap.empty_slice(),
        }),
    })
}
