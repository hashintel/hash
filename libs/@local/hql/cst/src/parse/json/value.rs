use std::borrow::Cow;

use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, LexingError, Number, Token, TokenKind};
use text_size::TextRange;

use crate::{arena, Arena};

pub enum ValueKind<'arena, 'source> {
    /// Represents a JSON null value
    Null,

    /// Represents a JSON boolean
    Bool(bool),

    /// Represents a JSON number, wether integer or floating point
    Number(Cow<'source, Number>),

    /// Represents a JSON string
    String(Cow<'source, str>),

    /// Represents a JSON array
    Array(arena::Vec<'arena, Value<'arena, 'source>>),

    /// Represents a JSON object
    Object(arena::HashMap<'arena, Cow<'source, str>, Value<'arena, 'source>>),
}

pub struct Value<'arena, 'source> {
    pub kind: ValueKind<'arena, 'source>,
    pub span: TextRange,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ValueParseError {
    #[error("unexpected end of input")]
    UnexpectedEndOfInput,
    #[error("lexing error")]
    Lex,
    #[error("unexpected token {}", token.kind)]
    UnexpectedToken { token: Token<'static> },
}

pub(crate) struct ValueParser<'arena, 'source, 'lexer> {
    pub arena: &'arena Arena,
    pub lexer: &'lexer mut Lexer<'source>,
}

impl<'arena, 'source, 'lexer> ValueParser<'arena, 'source, 'lexer> {
    fn next(&mut self) -> Result<Token<'source>, ValueParseError> {
        let token = self
            .lexer
            .next()
            .ok_or_else(|| Report::new(ValueParseError::UnexpectedEndOfInput))?;

        token.change_context(ValueParseError::Lex)
    }

    fn parse(&mut self, token: Option<Token<'source>>) -> Result<Value<'arena, 'source>, ValueParseError> {
        let token = self.next()?;

        let token = match token.kind {
            TokenKind::Bool(bool) => Ok(Value {
                kind: ValueKind::Bool(bool),
                span: token.span,
            }),
            TokenKind::Null => Ok(Value {
                kind: ValueKind::Null,
                span: token.span,
            }),
            TokenKind::Number(number) => Ok(Value {
                kind: ValueKind::Number(number),
                span: token.span,
            }),
            TokenKind::String(string) => Ok(Value {
                kind: ValueKind::String(string),
                span: token.span,
            }),
            TokenKind::LBracket => self.parse_array(token),
            TokenKind::LBrace => self.parse_object(token),
            _ => Err(Report::new(ValueParseError::UnexpectedToken {
                token: token.into_owned(),
            })),
        };

        token.change_context(ValueParseError::Lex)
    }

    /// Parse a JSON object, expects the `[` to already be consumed
    ///
    /// Adapted from: <https://github.com/maciejhirsz/logos/blob/master/examples/json_borrowed.rs#L109>
    fn parse_array(
        &mut self,
        token: Token<'source>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let span = token.span;

        let mut values = self.arena.vec(None);

        let mut token = self.next()?;
        let mut first = true;

        loop {
            if token.kind == TokenKind::RBracket {
                break;
            }

            let value = if first {
                // in case we're first, we don't expect a comma, just immediately parse the value
                first = false;
                let value = self.parse()?;
            }
        }
    }
}
