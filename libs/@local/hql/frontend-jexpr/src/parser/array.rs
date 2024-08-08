use std::assert_matches::debug_assert_matches;

use hql_diagnostics::Diagnostic;
use hql_span::{SpanId, TextRange};

use super::stream::TokenStream;
use crate::{
    lexer::{syntax_kind::SyntaxKind, token_kind::TokenKind},
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
// TODO: test `[]`, `[1]`, `[1, 2]`, error on `[1,]`, `[1, 2,]`, `[,1]`, `[,]`
// TODO: quickcheck
pub(crate) fn parse_array<'arena, 'lexer, 'source>(
    stream: &mut TokenStream<'arena, 'lexer, 'source>,
    tracked: bool,
    mut on_item: impl FnMut(
        &mut TokenStream<'arena, 'lexer, 'source>,
        Option<Token<'source>>,
    ) -> Result<(), Diagnostic<'static, SpanId>>,
) -> Result<TextRange, Diagnostic<'static, SpanId>> {
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
        let relay = if index == 0 {
            Some(token)
        } else if token.kind == TokenKind::Comma {
            None
        } else {
            // not using a parent here, because it malformed JSON, and therefore any pointer
            // information is useless
            let span = Span {
                range: token.span,
                pointer: None,
                parent_id: None,
            };

            // ensure even if we unwind, that we unwind the stack correctly
            if tracked {
                stream.stack.pop();
            }

            return Err(unexpected_token(
                span,
                [SyntaxKind::Comma, SyntaxKind::RBracket],
            ));
        };

        // we only track if requested, as some consumers may not require tracking at all
        if tracked {
            stream.stack.push(jsonptr::Token::from(index));
        }

        let result = on_item(stream, relay);

        if tracked {
            stream.stack.pop();
        }

        result?;
        index += 1;

        token = stream.next_or_err()?;
    }

    Ok(span)
}
