pub(crate) mod error;
pub(crate) mod visit;

use hashql_ast::node::{
    expr::{
        CallExpr, Expr, ExprKind,
        call::{Argument, LabeledArgument},
    },
    id::NodeId,
};

use self::{
    error::{empty, labeled_argument_invalid_identifier, labeled_argument_missing_prefix},
    visit::visit_array,
};
use super::error::ParserDiagnostic;
use crate::{
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, token::Token, token_kind::TokenKind},
    parser::{
        error::ParserDiagnosticCategory, expr::parse_expr, object::visit::visit_object,
        state::ParserState, string::parse_ident_from_string,
    },
    span::Span,
};

// peek twice, we know if it's a labeled argument if the first token is `{` and the second a
// string that starts with `:`.
fn parse_labelled_argument<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<Option<Vec<LabeledArgument<'heap>>>, ParserDiagnostic> {
    let Some(peek1) = state
        .peek()
        .change_category(ParserDiagnosticCategory::Lexer)?
    else {
        return Ok(None);
    };

    if peek1.kind.syntax() != SyntaxKind::LBrace {
        return Ok(None);
    }

    let Some(peek2) = state
        .peek2()
        .change_category(ParserDiagnosticCategory::Lexer)?
    else {
        return Ok(None);
    };

    let TokenKind::String(key) = &peek2.kind else {
        return Ok(None);
    };

    if !key.starts_with(':') {
        return Ok(None);
    }

    let token = state.advance().change_category(From::from)?;

    let mut labeled_arguments = Vec::new();

    #[expect(
        clippy::string_slice,
        reason = "we've just verified that it's an ASCII character"
    )]
    visit_object(state, token, |state, key| {
        if !key.value.starts_with(':') {
            return Err(
                labeled_argument_missing_prefix(state.insert_range(key.span), key.value)
                    .map_category(From::from),
            );
        }

        let mut label_span = key.span;

        let ident = &key.value[1..];
        let key_span = state.insert_range(key.span);
        let key = match parse_ident_from_string(state, key_span, ident) {
            Ok(value) => value,
            Err(error) => {
                return Err(
                    labeled_argument_invalid_identifier(state.spans(), key_span, error)
                        .map_category(From::from),
                );
            }
        };

        let value = parse_expr(state)?;
        label_span = label_span.cover(state.current_span());

        labeled_arguments.push(LabeledArgument {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(label_span),
            label: key,
            value: Argument {
                id: NodeId::PLACEHOLDER,
                span: value.span,
                value,
            },
        });

        Ok(())
    })?;

    Ok(Some(labeled_arguments))
}

pub(crate) fn parse_array<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
    token: Token<'source>,
) -> Result<Expr<'heap>, ParserDiagnostic> {
    debug_assert_eq!(token.kind.syntax(), SyntaxKind::LBracket);

    let mut function = None;
    let mut arguments = Vec::new();
    let mut labeled_arguments = Vec::new();

    let span = visit_array(state, token, |state| {
        match &mut function {
            Some(_) => {
                if let Some(labeled) = parse_labelled_argument(state)? {
                    labeled_arguments.extend(labeled);
                }

                let expr = parse_expr(state)?;

                arguments.push(Argument {
                    id: NodeId::PLACEHOLDER,
                    span: expr.span,
                    value: expr,
                });
            }
            function @ None => *function = Some(parse_expr(state)?),
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
            labeled_arguments: heap.boxed_slice(labeled_arguments),
        }),
    })
}
