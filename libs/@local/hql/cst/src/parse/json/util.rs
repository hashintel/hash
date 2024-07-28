use std::{assert_matches::assert_matches, borrow::Cow};

use error_stack::{Context, Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, SyntaxKind, Token, TokenKind};
use text_size::TextRange;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ParseError {
    #[error("unexpected end of input")]
    EndOfInput,
    #[error("malformed JSON input")]
    Lex,
}

pub(crate) struct EofParser<'source, 'lexer> {
    pub lexer: &'lexer mut Lexer<'source>,
}

impl<'source, 'lexer> EofParser<'source, 'lexer> {
    pub(crate) fn advance(&mut self) -> Result<Token<'source>, ParseError> {
        self.lexer
            .next()
            .ok_or_else(|| {
                Report::new(ParseError::EndOfInput).attach(Location::new(self.lexer.span()))
            })?
            .change_context(ParseError::Lex)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ArrayParserError {
    #[error("unable to lex input")]
    Lex,
    #[error("error while parsing array item")]
    Item,
    #[error("expected `,` or `]`, received {received}")]
    ExpectedCommaOrRBracket { received: SyntaxKind },
}

pub(crate) struct ArrayParser<'source, 'lexer> {
    pub lexer: EofParser<'source, 'lexer>,
}

impl<'source, 'lexer> ArrayParser<'source, 'lexer> {
    pub(crate) fn new(lexer: &'lexer mut Lexer<'source>) -> Self {
        Self {
            lexer: EofParser { lexer },
        }
    }

    /// Parse an array from the lexer
    ///
    /// Assumes that the lexer has already consumed the opening bracket.
    ///
    /// # Panics
    ///
    /// Panics if the lexer has not consumed the opening bracket.
    // TODO: test `[]`, `[1]`, `[1, 2]`, error on `[1,]`, `[1, 2,]`, `[,1]`, `[,]`
    // TODO: quickcheck
    pub(crate) fn parse<E>(
        &mut self,
        token: Token<'source>,
        mut on_item: impl FnMut(&mut Lexer<'source>, Option<Token<'source>>) -> Result<(), E>,
    ) -> Result<TextRange, ArrayParserError>
    where
        E: Context,
    {
        assert_matches!(token.kind, TokenKind::LBracket);
        let mut span = token.span;

        let mut token = self.lexer.advance().change_context(ArrayParserError::Lex)?;
        let mut first = true;

        loop {
            // If we encounter a closing bracket, we're done
            if token.kind == TokenKind::RBracket {
                span = span.cover(token.span);
                break;
            }

            // This is where we diverge, in case we're first, we don't need to consume a comma
            // and can simply give the token to `on_item`, otherwise, expect a comma, and then just
            // parse next token
            if first {
                first = false;
                on_item(self.lexer.lexer, Some(token)).change_context(ArrayParserError::Item)?;
            } else if token.kind == TokenKind::Comma {
                on_item(self.lexer.lexer, None).change_context(ArrayParserError::Item)?;
            } else {
                return Err(Report::new(ArrayParserError::ExpectedCommaOrRBracket {
                    received: SyntaxKind::from(&token.kind),
                })
                .attach(Location::new(token.span)));
            }

            token = self.lexer.advance().change_context(ArrayParserError::Lex)?;
        }

        Ok(span)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ObjectParserError {
    #[error("unable to lex input")]
    Lex,
    #[error("error while parsing object entry")]
    Entry,
    #[error("expected `,` or `}}`, received {received}")]
    ExpectedCommaOrRBrace { received: SyntaxKind },
    #[error("expected key to be string, received {received}")]
    ExpectedStringKey { received: SyntaxKind },
    #[error("expected `:`, received {received}")]
    ExpectedColon { received: SyntaxKind },
}

pub(crate) struct ObjectParser<'source, 'lexer> {
    pub lexer: EofParser<'source, 'lexer>,
}

impl<'source, 'lexer> ObjectParser<'source, 'lexer> {
    pub(crate) fn new(lexer: &'lexer mut Lexer<'source>) -> Self {
        Self {
            lexer: EofParser { lexer },
        }
    }

    /// Parse an object from the lexer
    ///
    /// Assumes that the lexer has already consumed the opening brace.
    ///
    /// # Panics
    ///
    /// Panics if the lexer has not consumed the opening brace.
    // TODO: test `{}`, `{"fn": "foo"}`, `{"fn": "foo",}`, `{,"fn": "foo"}`, `{123: "foo"}`, `{"foo"
    // "bar"}`
    pub(crate) fn parse<E>(
        &mut self,
        token: Token<'source>,
        mut on_entry: impl FnMut(&mut Lexer<'source>, Cow<'source, str>) -> Result<(), E>,
    ) -> Result<TextRange, ObjectParserError>
    where
        E: Context,
    {
        assert_matches!(token.kind, TokenKind::LBrace);

        let mut span = token.span;

        let mut token = self
            .lexer
            .advance()
            .change_context(ObjectParserError::Lex)?;
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
                self.lexer
                    .advance()
                    .change_context(ObjectParserError::Lex)?
            } else {
                // ... no comma == error
                return Err(Report::new(ObjectParserError::ExpectedCommaOrRBrace {
                    received: SyntaxKind::from(&token.kind),
                })
                .attach(Location::new(token.span)));
            };

            let TokenKind::String(key) = key.kind else {
                return Err(Report::new(ObjectParserError::ExpectedStringKey {
                    received: SyntaxKind::from(&key.kind),
                })
                .attach(Location::new(key.span)));
            };

            let colon = self
                .lexer
                .advance()
                .change_context(ObjectParserError::Lex)?;
            if colon.kind != TokenKind::Colon {
                return Err(Report::new(ObjectParserError::ExpectedColon {
                    received: SyntaxKind::from(&colon.kind),
                })
                .attach(Location::new(colon.span)));
            }

            on_entry(self.lexer.lexer, key).change_context(ObjectParserError::Entry)?;

            token = self
                .lexer
                .advance()
                .change_context(ObjectParserError::Lex)?;
        }

        Ok(span)
    }
}
