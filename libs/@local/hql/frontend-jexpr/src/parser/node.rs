use std::borrow::Cow;

use hql_cst::{expr::Expr, Node};
use hql_diagnostics::Diagnostic;
use hql_span::{SpanId, TextRange};
use winnow::{
    combinator::{alt, cond, cut_err, peek},
    dispatch,
    error::{ContextError, ErrMode, ParserError},
    token::any,
    BStr, Located, Parser,
};

use super::stream::TokenStream;
use crate::{
    lexer::{syntax_kind_set::SyntaxKindSet, token::Token, token_kind::TokenKind},
    parser::{path::parse_path, signature::parse_signature, symbol::ParseRestriction},
    span::Span,
};

pub(crate) fn parse_node<'arena, 'lexer, 'source>(
    stream: &mut TokenStream<'arena, 'lexer, 'source>,
    token: Option<Token<'source>>,
) -> Result<Node<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let token = if let Some(token) = token {
        token
    } else {
        stream.next_or_err()?
    };

    match &token.kind {
        TokenKind::String(value) => parse_string(stream, value, token.span),
        TokenKind::LBracket => parse_call(stream, token),
        TokenKind::LBrace => parse_object(stream, token),
        _ => {
            // even if we're nested, this is a parsing error, therefore always absolute, as we're
            // not operating "on" an item
            let span = Span {
                range: token.span,
                pointer: None,
                parent_id: None,
            };

            let span = stream.lexer.spans_mut().insert(span);

            Err(unexpected_token(
                span,
                [SyntaxKind::String, SyntaxKind::LBracket, SyntaxKind::LBrace],
            ))
        }
    }
}

pub(crate) fn parse_string<'arena, 'lexer, 'source>(
    stream: &mut TokenStream<'arena, 'lexer, 'source>,
    value: Cow<'source, str>,
    span: TextRange,
) -> Result<Node<'arena, 'source>, Diagnostic<'static, SpanId>> {
    // we're trying to be a bit intelligent here, so that we can give better diagnostics
    // The problem is primarily with `<`, `<` is both valid as the first character of a signature
    // and path.

    // The following is a valid path: `<::...`, `<` (where ... is any valid path), while `<>() ->
    // Unit` is a valid signature.

    let mut is_path = false;
    let mut is_signature = false;

    if value.starts_with('<') {
        if value.len() == 1 || value.starts_with("<::") {
            // guaranteed to be a path
            is_path = true;
        } else {
            // guaranteed to be a signature
            is_signature = true;
        }
    } else if value.starts_with('(') {
        // guaranteed to be a signature (generics are optional, arguments are not)
        is_signature = true;
    } else {
        // guaranteed to be a path
        is_path = true;
    }

    let parser = alt((
        cond(
            is_path,
            cut_err(parse_path(ParseRestriction::None)).map(Expr::Path),
        ),
        cond(is_signature, cut_err(parse_signature).map(Expr::Signature)),
    ));

    let value = parser
        .parse(winnow::Stateful {
            input: Located::new(BStr::from(value)),
            state: stream.arena,
        })
        .map_err(|error: ParserError<_, ErrMode<ContextError>>| todo!());

    todo!()
}
