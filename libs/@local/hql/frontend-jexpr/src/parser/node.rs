use std::borrow::Cow;

use hql_cst::{
    expr::{call::Call, Expr},
    Node,
};
use hql_diagnostics::Diagnostic;
use hql_span::{SpanId, TextRange, TextSize};
use jsonptr::PointerBuf;
use winnow::{
    combinator::{alt, cond, cut_err, peek},
    dispatch,
    error::{ContextError, ErrMode, ParseError, ParserError},
    token::any,
    BStr, Located, Parser,
};

use super::{array::parse_array, stream::TokenStream};
use crate::{
    lexer::{syntax_kind_set::SyntaxKindSet, token::Token, token_kind::TokenKind},
    parser::{
        error::{expected_callee, invalid_identifier, invalid_signature},
        path::parse_path,
        signature::parse_signature,
        symbol::ParseRestriction,
    },
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

            let span = stream.insert_span(span);

            Err(unexpected_token(
                span,
                [SyntaxKind::String, SyntaxKind::LBracket, SyntaxKind::LBrace],
            ))
        }
    }
}

fn parse_call<'arena, 'lexer, 'source>(
    stream: &mut TokenStream<'arena, 'lexer, 'source>,
    token: Token<'source>,
) -> Result<Node<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let mut r#fn = None;
    let mut args = stream.arena.vec(None);

    let span = parse_array(stream, true, |stream, token| {
        let node = parse_node(stream, token)?;

        match r#fn {
            Some(r#fn) => args.push(Some(node)),
            None => r#fn = Some(node),
        }

        Ok(())
    })?;

    let span = stream.insert_span(Span {
        range: span,
        pointer: Some(PointerBuf::from_tokens(stream.stack.clone())),
        parent_id: None,
    });

    let r#fn = r#fn.ok_or_else(|| expected_callee(span))?;

    Ok(Node {
        expr: Expr::Call(Call {
            r#fn: self.arena.boxed(r#fn),
            args: args.into_boxed_slice(),
        }),
        span,
    })
}

fn parse_string<'arena, 'lexer, 'source>(
    stream: &mut TokenStream<'arena, 'lexer, 'source>,
    value: Cow<'source, str>,
    span: TextRange,
) -> Result<Node<'arena, 'source>, Diagnostic<'static, SpanId>> {
    enum ParseDecision {
        Path,
        Signature,
    }

    // we're trying to be a bit intelligent here, so that we can give better diagnostics
    // The problem is primarily with `<`, `<` is both valid as the first character of a signature
    // and path.

    // The following is a valid path: `<::...`, `<` (where ... is any valid path), while `<>() ->
    // Unit` is a valid signature.

    let mut is_path = false;
    let mut is_signature = false;

    let input = winnow::Stateful {
        input: Located::new(BStr::from(value)),
        state: stream.arena,
    };

    let result = if value.starts_with('<') {
        if value.len() == 1 || value.starts_with("<::") {
            // guaranteed to be a path
            // (`<::` is not a valid signature, as `::` is not a valid identifier)
            parse_path(ParseRestriction::None)
                .parse(input)
                .map(Expr::Path)
                .map_err(|error| (ParseDecision::Path, error))
        } else {
            // guaranteed to be a signature
            parse_signature
                .parse(input)
                .map(Expr::Signature)
                .map_err(|error| (ParseDecision::Signature, error))
        }
    } else if value.starts_with('(') {
        // guaranteed to be a signature (generics are optional, arguments are not)
        parse_signature
            .parse(input)
            .map(Expr::Signature)
            .map_err(|error| (ParseDecision::Signature, error))
    } else {
        // guaranteed to be a path
        parse_path(ParseRestriction::None)
            .parse(input)
            .map(Expr::Path)
            .map_err(|error| (ParseDecision::Path, error))
    };

    let span = Span {
        range: span,
        pointer: Some(PointerBuf::from_tokens(stream.stack.clone())),
        parent_id: None,
    };
    let span = stream.insert_span(span);

    let (decision, error): (_, ParseError<_, ErrMode<ContextError>>) = match result {
        Ok(expr) => return Ok(Node { expr, span }),
        Err((decision, error)) => (decision, error),
    };

    #[expect(
        clippy::cast_possible_truncation,
        reason = "lexer ensures input is never larger than 4GiB"
    )]
    let span = {
        let start = TextSize::from(error.offset() as u32);
        let end = TextSize::from(value.len() as u32);

        Span {
            range: TextRange::new(start, end.min(start)),
            pointer: span.pointer,
            parent_id: span.parent_id,
        }
    };

    let span = stream.insert_span(span);

    let diagnostic = match decision {
        ParseDecision::Path => invalid_identifier(span, error),
        ParseDecision::Signature => invalid_signature(span, error),
    };

    Err(diagnostic)
}

#[cfg(test)]
mod test {
    use insta::assert_debug_snapshot;

    use crate::{arena::Arena, parse::json::node::NodeParser};

    #[test]
    fn fn_is_expr() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(
            r#"[
            ["input", "variable"],
            "arg1",
            "arg2"
        ]"#,
        );

        assert_debug_snapshot!(result);
    }

    #[test]
    fn fn_empty_args() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"["func"]"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn fn_empty() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse("[]");

        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_path() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#""symbol""#);
        assert_debug_snapshot!(result);

        let result = NodeParser::new(&arena).parse(r#""foo::bar""#);
        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_signature() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#""<T: Int>(a: T) -> T""#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_invalid() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#""1234""#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"const": 42}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant_with_type() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"type": "u32", "const": 42}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant_with_extra_fields() {
        let arena = Arena::new();

        let result =
            NodeParser::new(&arena).parse(r#"{"type": "u32", "const": 42, "sig": "() -> Unit"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_call() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"fn": "func", "args": ["arg1", "arg2"]}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_args_without_fn() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"args": ["arg1", "arg2"]}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_call_without_args() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"fn": "func"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_signature() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"sig": "<T: Int>(a: T) -> T"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_invalid_multiple() {
        let arena = Arena::new();

        let result =
            NodeParser::new(&arena).parse(r#"{"sig": "<T: Int>(a: T) -> T", "fn": "func"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_invalid_duplicate_key() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"fn": "func", "fn": "func"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_invalid() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"unknown": "key"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_empty() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse("{}");

        assert_debug_snapshot!(result);
    }
}
