use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, SyntaxKind, Token, TokenKind};

use super::util::{ArrayParser, EofParser, ObjectParser};
use crate::{
    value::{Value, ValueKind},
    Arena,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ValueParseError {
    #[error("unable to parse input")]
    Parse,
    #[error("unable to parse array")]
    Array,
    #[error("unable to parse object")]
    Object,
    #[error("unexpected token, received {received}")]
    UnexpectedToken { received: SyntaxKind },
    #[error("duplicate key {key}")]
    DuplicateKey { key: Box<str> },
}

pub(crate) struct ValueParser<'arena> {
    arena: &'arena Arena,
}

impl<'arena> ValueParser<'arena> {
    pub(crate) fn new(arena: &'arena Arena) -> Self {
        Self { arena }
    }

    pub(crate) fn parse<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Option<Token<'source>>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let token = match token {
            Some(token) => token,
            None => {
                let mut eof = EofParser { lexer };
                eof.advance().change_context(ValueParseError::Parse)?
            }
        };

        match token.kind {
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
            TokenKind::LBracket => self.parse_array(lexer, token),
            TokenKind::LBrace => self.parse_object(lexer, token),
            _ => Err(Report::new(ValueParseError::UnexpectedToken {
                received: SyntaxKind::from(&token.kind),
            }))
            .attach(Location::new(token.span)),
        }
    }

    /// Parse a JSON object, expects the `[` to already be consumed
    fn parse_array<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Token<'source>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let mut values = self.arena.vec(None);

        let mut parser = ArrayParser::new(lexer);

        let span = parser
            .parse(token, |lexer, token| {
                let item = self.parse(lexer, token)?;
                values.push(item);
                Ok(())
            })
            .change_context(ValueParseError::Array)?;

        Ok(Value {
            kind: ValueKind::Array(values),
            span,
        })
    }

    /// Parse a JSON object, expects the `{` to already be consumed
    fn parse_object<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Token<'source>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let mut object = self.arena.hash_map(None);

        let mut parser = ObjectParser::new(lexer);
        let span = parser
            .parse(token, |lexer, key, key_span| {
                if object.contains_key(&key) {
                    return Err(Report::new(ValueParseError::DuplicateKey {
                        key: key.into_owned().into_boxed_str(),
                    })
                    .attach(Location::new(key_span)));
                }

                let value = self.parse(lexer, None)?;
                object.insert(key, value);
                Ok(())
            })
            .change_context(ValueParseError::Object)?;

        Ok(Value {
            kind: ValueKind::Object(object),
            span,
        })
    }
}
