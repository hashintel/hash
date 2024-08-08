use std::{assert_matches::debug_assert_matches, borrow::Cow};

use hql_diagnostics::{help::Help, note::Note, Diagnostic};
use hql_span::{SpanId, TextRange};

use super::stream::TokenStream;
use crate::{
    lexer::{syntax_kind::SyntaxKind, token::Token, token_kind::TokenKind},
    parser::error::unexpected_token,
    span::Span,
};

pub(crate) struct Key {
    pub span: TextRange,
    pub value: Cow<'static, str>,
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "API contract, we want to signify to the user, we're now proceeding with this \
              specific token. Not that we hold it temporary, but instead that we consume it."
)]
pub(crate) fn parse_object<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
    token: Token<'source>,
    mut on_entry: impl FnMut(
        &mut TokenStream<'arena, 'source>,
        Key,
    ) -> Result<(), Diagnostic<'static, SpanId>>,
) -> Result<TextRange, Diagnostic<'static, SpanId>> {
    debug_assert_matches!(token.kind, TokenKind::LBrace);

    let mut span = token.span;

    let mut token = stream.next_or_err()?;
    let mut first = true;

    loop {
        // If we encounter a closing brace, we're done
        if token.kind == TokenKind::RBrace {
            span = span.cover(token.span);
            break;
        }

        // this is where we diverge, if we're in the first iteration we don't expect a comma
        let key = if first {
            first = false;
            // in the first iteration the key is simply the token itself
            token
        } else if token.kind == TokenKind::Comma {
            // the key is the next token
            stream.next_or_err()?
        } else {
            // ... no comma == error
            let span = stream.insert_span(Span {
                range: token.span,
                pointer: None,
                parent_id: None,
            });

            return Err(unexpected_token(
                span,
                [SyntaxKind::Comma, SyntaxKind::RBrace],
            ));
        };

        let key_span = key.span;
        let TokenKind::String(key) = key.kind else {
            let span = stream.insert_span(Span {
                range: key.span,
                pointer: None,
                parent_id: None,
            });

            let mut diagnostic = unexpected_token(span, [SyntaxKind::String]);

            // try to be extra helpful if they chose to use a number as a key
            if key.kind.syntax() == SyntaxKind::Number {
                diagnostic.help = Some(Help::new(
                    "Did you mean to use a string instead of a number?",
                ));
                diagnostic.note = Some(Note::new("Numbers are not valid keys in JSON."));
            }

            return Err(diagnostic);
        };

        let colon = stream.next_or_err()?;
        if colon.kind != TokenKind::Colon {
            let span = stream.insert_span(Span {
                range: colon.span,
                pointer: None,
                parent_id: None,
            });

            let mut diagnostic = unexpected_token(span, [SyntaxKind::Colon]);

            diagnostic.help = Some(Help::new("Did you forget to add a colon?"));

            return Err(diagnostic);
        }

        stream.descend(
            match key.clone() {
                Cow::Borrowed(key) => jsonptr::Token::from(key),
                Cow::Owned(key) => jsonptr::Token::from(key),
            },
            |stream| {
                on_entry(
                    stream,
                    Key {
                        span: key_span,
                        value: key,
                    },
                )
            },
        )?;

        token = stream.next_or_err()?;
    }

    Ok(span)
}
