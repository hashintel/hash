use hql_diagnostics::Diagnostic;
use hql_span::SpanId;

use super::{array::parse_array, error::unexpected_token, parse_expr, TokenStream};
use crate::{lexer::syntax_kind::SyntaxKind, span::Span};

pub(crate) fn parse_program<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
) -> Result<Program<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let token = stream.next_or_err()?;

    if token.kind.syntax() != SyntaxKind::LBracket {
        let span = stream.insert_span(Span {
            range: token.span,
            pointer: stream.pointer(),
            parent_id: None,
        });

        return Err(unexpected_token(span, [SyntaxKind::LBracket]));
    }

    let mut expressions = stream.arena.vec(None);
    let range = parse_array(stream, token, |stream, token| {
        let expr = parse_expr(stream, token)?;

        expressions.push(expr);

        Ok(())
    })?;

    let span = stream.insert_span(Span {
        range,
        pointer: stream.pointer(),
        parent_id: None,
    });

    Ok(Program { expressions, span })
}
