use std::borrow::Cow;

use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Number, Token, TokenKind};
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

pub(crate) struct ValueParser<'arena, 'source> {
    pub arena: &'arena Arena,
    pub lexer: Lexer<'source>,
}

fn parse<'arena, 'source>(
    arena: &'arena Arena,
    lexer: &mut Lexer<'source>,
) -> Result<Value<'arena, 'source>, ValueParseError> {
    let Some(token) = lexer.next() else {
        return Err(Report::new(ValueParseError::UnexpectedEndOfInput));
    };

    let token = token.change_context(ValueParseError::Lex)?;

    let token = match token.kind {
        // TokenKind::Bool(bool) => Ok(Value {
        //     kind: ValueKind::Bool(bool),
        //     span: token.span,
        // }),
        // TokenKind::Null => Ok(Value {
        //     kind: ValueKind::Null,
        //     span: token.span,
        // }),
        // TokenKind::Number(number) => Ok(Value {
        //     kind: ValueKind::Number(number),
        //     span: token.span,
        // }),
        // TokenKind::String(string) => Ok(Value {
        //     kind: ValueKind::String(string),
        //     span: token.span,
        // }),
        // TokenKind::LBracket => parse_array(arena, lexer, token),
        // TokenKind::LBrace => parse_object(arena, lexer, token),
        _ => Err(Report::new(ValueParseError::UnexpectedToken { token })),
    };

    token.change_context(ValueParseError::Lex)
}

/// Parse a JSON array, expects the `[` to already be consumed
fn parse_array<'arena, 'source>(
    arena: &'arena Arena,
    lexer: &mut Lexer<'source>,
    token: Token<'source>,
) -> Result<Value<'arena, 'source>, ValueParseError> {
    let span = token.span;

    todo!()
}

/// Parse a JSON object, expects the `{` to already be consumed
fn parse_object<'arena, 'source>(
    arena: &'arena Arena,
    lexer: &mut Lexer<'source>,
    token: Token<'source>,
) -> Result<Value<'arena, 'source>, ValueParseError> {
    let span = token.span;

    todo!()
}
