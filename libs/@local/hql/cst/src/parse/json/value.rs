use std::borrow::Cow;

use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, LexingError, Number, SyntaxKind, Token, TokenKind};
use text_size::TextRange;

use super::util::{ArrayParser, EofParser, ObjectParser};
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
    #[error("lexing error")]
    Lex,
    #[error("unable to parse array")]
    Array,
    #[error("unable to parse object")]
    Object,
    #[error("unexpected token, received {received}")]
    UnexpectedToken { received: SyntaxKind },
    #[error("duplicate key {key}")]
    DuplicateKey { key: Box<str> },
}

pub(crate) struct ValueParser<'arena, 'source, 'lexer> {
    pub arena: &'arena Arena,
    pub lexer: EofParser<'source, 'lexer>,
}

impl<'arena, 'source, 'lexer> ValueParser<'arena, 'source, 'lexer> {
    fn parse_inner(
        arena: &'arena Arena,
        lexer: &mut Lexer<'source>,
        token: Option<Token<'source>>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let token = match token {
            Some(token) => token,
            None => {
                let mut eof = EofParser { lexer };
                eof.advance().change_context(ValueParseError::Lex)?
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
            TokenKind::LBracket => Self::parse_array(arena, lexer, token),
            TokenKind::LBrace => Self::parse_object(arena, lexer, token),
            _ => Err(Report::new(ValueParseError::UnexpectedToken {
                received: SyntaxKind::from(&token.kind),
            })),
        }
    }

    /// Parse a JSON object, expects the `[` to already be consumed
    fn parse_array(
        arena: &'arena Arena,
        lexer: &mut Lexer<'source>,
        token: Token<'source>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let mut values = arena.vec(None);

        let mut parser = ArrayParser::new(lexer);

        let span = parser
            .parse(token, |lexer, token| {
                let item = Self::parse_inner(arena, lexer, token)?;
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
    fn parse_object(
        arena: &'arena Arena,
        lexer: &mut Lexer<'source>,
        token: Token<'source>,
    ) -> Result<Value<'arena, 'source>, ValueParseError> {
        let mut object = arena.hash_map(None);

        let mut parser = ObjectParser::new(lexer);
        let span = parser
            .parse(token, |lexer, key| {
                if object.contains_key(&key) {
                    return Err(Report::new(ValueParseError::DuplicateKey {
                        key: key.into_owned().into_boxed_str(),
                    }));
                }

                let value = Self::parse_inner(arena, lexer, None)?;
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
