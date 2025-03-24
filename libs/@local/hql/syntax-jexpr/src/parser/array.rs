use core::assert_matches::debug_assert_matches;

use hql_span::TextRange;

use super::stream::TokenStream;
use crate::{
    error::{JExprDiagnostic, JExprDiagnosticCategory},
    lexer::{syntax_kind::SyntaxKind, token::Token, token_kind::TokenKind},
    parser::error::unexpected_token,
    span::Span,
};

/// Parse an array from the lexer
///
/// Assumes that the lexer has already consumed the opening bracket.
///
/// # Panics
///
/// Panics if the lexer has not consumed the opening bracket.
#[expect(
    clippy::needless_pass_by_value,
    reason = "API contract, we want to signify to the user, we're now proceeding with this \
              specific token. Not that we hold it temporary, but instead that we consume it."
)]
pub(crate) fn parse_array<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
    token: Token<'source>,
    mut on_item: impl FnMut(
        &mut TokenStream<'arena, 'source>,
        Option<Token<'source>>,
    ) -> Result<(), JExprDiagnostic>,
) -> Result<TextRange, JExprDiagnostic> {
    debug_assert_matches!(token.kind, TokenKind::LBracket);
    let mut span = token.span;

    let mut token = stream.next_or_err()?;
    let mut index: usize = 0;

    loop {
        // If we encounter a closing bracket, we're done
        if token.kind == TokenKind::RBracket {
            span = span.cover(token.span);
            break;
        }

        // This is where we diverge, in case we're first, we don't need to consume a comma
        // and can simply give the token to `on_item`, otherwise, expect a comma, and then just
        // parse next token
        let peeked = if index == 0 {
            Some(token)
        } else if token.kind == TokenKind::Comma {
            None
        } else {
            // not using a parent here, because it malformed JSON, and therefore any pointer
            // information is useless
            let span = stream.insert_span(Span {
                range: token.span,
                pointer: None,
                parent_id: None,
            });

            return Err(
                unexpected_token(span, [SyntaxKind::Comma, SyntaxKind::RBracket])
                    .map_category(JExprDiagnosticCategory::Parser),
            );
        };

        stream.descend(
            peeked,
            |_| jsonptr::Token::from(index),
            |stream, peeked| on_item(stream, peeked),
        )?;

        index += 1;

        token = stream.next_or_err()?;
    }

    Ok(span)
}
