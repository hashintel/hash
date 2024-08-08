use alloc::borrow::Cow;

use hql_cst::{
    arena,
    value::{Value, ValueKind},
};
use hql_diagnostics::Diagnostic;
use hql_span::SpanId;

use super::{
    array::parse_array,
    error::{duplicate_key, unexpected_token},
    object::parse_object,
    stream::TokenStream,
};
use crate::{
    lexer::{syntax_kind::SyntaxKind, token::Token, token_kind::TokenKind},
    span::Span,
};

pub(crate) fn parse_value<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
    token: Option<Token<'source>>,
) -> Result<Value<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let token = if let Some(token) = token {
        token
    } else {
        stream.next_or_err()?
    };

    let kind = match token.kind {
        TokenKind::Bool(bool) => ValueKind::Bool(bool),
        TokenKind::Null => ValueKind::Null,
        TokenKind::Number(number) => ValueKind::Number(number),
        TokenKind::String(string) => ValueKind::String(string),
        TokenKind::LBracket => return parse_value_array(stream, token),
        TokenKind::LBrace => return parse_value_object(stream, token),
        _ => {
            // no pointer, because it is malformed JSON
            let span = stream.insert_span(Span {
                range: token.span,
                pointer: None,
                parent_id: None,
            });

            return Err(unexpected_token(
                span,
                [
                    SyntaxKind::True,
                    SyntaxKind::False,
                    SyntaxKind::Null,
                    SyntaxKind::Number,
                    SyntaxKind::String,
                    SyntaxKind::LBracket,
                    SyntaxKind::LBrace,
                ],
            ));
        }
    };

    let span = stream.insert_span(Span {
        range: token.span,
        pointer: stream.pointer(),
        parent_id: None,
    });

    Ok(Value { kind, span })
}

/// Parse a JSON object, expects the `[` to already be consumed
fn parse_value_array<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
    token: Token<'source>,
) -> Result<Value<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let mut values = stream.arena.vec(None);

    let span = parse_array(stream, token, |lexer, token| {
        let item = parse_value(lexer, token)?;
        values.push(item);
        Ok(())
    })?;

    let span = stream.insert_span(Span {
        range: span,
        pointer: stream.pointer(),
        parent_id: None,
    });

    Ok(Value {
        kind: ValueKind::Array(values),
        span,
    })
}

/// Parse a JSON object, expects the `{` to already be consumed
fn parse_value_object<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
    token: Token<'source>,
) -> Result<Value<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let mut object: arena::HashMap<Cow<'source, str>, Value<'arena, 'source>> =
        stream.arena.hash_map(None);

    let span = parse_object(stream, token, |stream, key| {
        if let Some(value) = object.get(&key.value) {
            let span = stream.insert_span(Span {
                range: key.span,
                pointer: stream.pointer(),
                parent_id: None,
            });

            return Err(duplicate_key(span, value.span));
        }

        let value = parse_value(stream, None)?;
        object.insert(key.value, value);
        Ok(())
    })?;

    let span = stream.insert_span(Span {
        range: span,
        pointer: stream.pointer(),
        parent_id: None,
    });

    Ok(Value {
        kind: ValueKind::Object(object),
        span,
    })
}

// TODO: test duplicate key
