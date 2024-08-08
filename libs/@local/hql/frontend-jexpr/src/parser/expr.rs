use std::borrow::Cow;

use hql_cst::expr::{call::Call, Expr, ExprKind};
use hql_diagnostics::Diagnostic;
use hql_span::{SpanId, TextRange, TextSize};
use jsonptr::PointerBuf;
use winnow::{
    error::{ContextError, ErrMode, ParseError},
    BStr, Located, Parser,
};

use super::{array::parse_array, error::unexpected_token, stream::TokenStream};
use crate::{
    lexer::{syntax_kind::SyntaxKind, token::Token, token_kind::TokenKind},
    parser::{
        error::{expected_callee, invalid_identifier, invalid_signature},
        path::parse_path,
        signature::parse_signature,
        symbol::ParseRestriction,
    },
    span::Span,
};

pub(crate) fn parse_expr<'arena, 'lexer, 'source>(
    stream: &mut TokenStream<'arena, 'lexer, 'source>,
    token: Option<Token<'source>>,
) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let token = if let Some(token) = token {
        token
    } else {
        stream.next_or_err()?
    };

    match &token.kind {
        TokenKind::String(value) => parse_string(stream, value, token.span),
        TokenKind::LBracket => parse_call(stream, token),
        TokenKind::LBrace => parse_explicit(stream, token),
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
) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let mut r#fn = None;
    let mut args = stream.arena.vec(None);

    let span = parse_array(stream, token, |stream, token| {
        let node = parse_expr(stream, token)?;

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

    Ok(Expr {
        kind: ExprKind::Call(Call {
            r#fn: stream.arena.boxed(r#fn),
            args: args.into_boxed_slice(),
        }),
        span,
    })
}

fn parse_string<'arena, 'lexer, 'source>(
    stream: &mut TokenStream<'arena, 'lexer, 'source>,
    value: Cow<'source, str>,
    span: TextRange,
) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>> {
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
                .map(ExprKind::Path)
                .map_err(|error| (ParseDecision::Path, error))
        } else {
            // guaranteed to be a signature
            parse_signature
                .parse(input)
                .map(ExprKind::Signature)
                .map_err(|error| (ParseDecision::Signature, error))
        }
    } else if value.starts_with('(') {
        // guaranteed to be a signature (generics are optional, arguments are not)
        parse_signature
            .parse(input)
            .map(ExprKind::Signature)
            .map_err(|error| (ParseDecision::Signature, error))
    } else {
        // guaranteed to be a path
        parse_path(ParseRestriction::None)
            .parse(input)
            .map(ExprKind::Path)
            .map_err(|error| (ParseDecision::Path, error))
    };

    let span = Span {
        range: span,
        pointer: Some(PointerBuf::from_tokens(stream.stack.clone())),
        parent_id: None,
    };
    let span = stream.insert_span(span);

    let (decision, error): (_, ParseError<_, ErrMode<ContextError>>) = match result {
        Ok(kind) => return Ok(Expr { kind, span }),
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
    use std::assert_matches::assert_matches;

    use insta::assert_debug_snapshot;

    use super::ExprKind;
    use crate::arena::Arena;

    // This needs to be a macro, because we need to get the function name for auto-naming.
    macro_rules! assert_expr {
        ($expr:expr, $pattern:pat) => {{
            let arena = Arena::new();

            let result = Expr::from_str(&arena, $expr);

            assert_debug_snapshot!(insta::_macro_support::AutoName, result, $expr);

            assert_matches!(result, $pattern);
        }};

        ($expr:expr) => {{
            assert_expr!($expr, _);
        }};
    }

    #[test]
    fn fn_is_expr() {
        assert_expr!(
            r#"[
                ["input", "variable"],
                "arg1",
                "arg2"
            ]"#,
            Ok(ExprKind::Call(_))
        );
    }

    #[test]
    fn fn_empty_args() {
        assert_expr!(r#"["func"]"#, Ok(ExprKind::Call(_)));
    }

    #[test]
    fn fn_empty() {
        assert_expr!("[]", Err(_));
    }

    #[test]
    fn string_is_path() {
        assert_expr!(r#""symbol""#, Ok(ExprKind::Path(_)));

        assert_expr!(r#""foo::bar""#, Ok(ExprKind::Path(_)));
    }

    #[test]
    fn string_is_signature() {
        assert_expr!(r#""<T: Int>(a: T) -> T""#, Ok(ExprKind::Signature(_)));
    }

    #[test]
    fn string_is_invalid() {
        assert_expr!(r#""1234""#, Err(_));
    }

    #[test]
    fn object_is_constant() {
        assert_expr!(r#"{"const": 42}"#, Ok(ExprKind::Constant(_)));
    }

    #[test]
    fn object_is_constant_with_type() {
        assert_expr!(r#"{"type": "u32", "const": 42}"#, Ok(ExprKind::Constant(_)));
    }

    #[test]
    fn object_is_constant_with_extra_fields() {
        assert_expr!(
            r#"{"type": "u32", "const": 42, "sig": "() -> Unit"}"#,
            Err(_)
        );
    }

    #[test]
    fn object_is_call() {
        assert_expr!(
            r#"{"fn": "func", "args": ["arg1", "arg2"]}"#,
            Ok(ExprKind::Call(_))
        );
    }

    #[test]
    fn object_is_args_without_fn() {
        assert_expr!(r#"{"args": ["arg1", "arg2"]}"#, Err(_));
    }

    #[test]
    fn object_is_call_without_args() {
        assert_expr!(r#"{"fn": "func"}"#, Ok(ExprKind::Call(_)));
    }

    #[test]
    fn object_is_signature() {
        assert_expr!(
            r#"{"sig": "<T: Int>(a: T) -> T"}"#,
            Ok(ExprKind::Signature(_))
        );
    }

    #[test]
    fn object_is_invalid_multiple() {
        assert_expr!(r#"{"sig": "<T: Int>(a: T) -> T", "fn": "func"}"#, Err(_));
    }

    #[test]
    fn object_is_invalid() {
        assert_expr!(r#"{"unknown": "key"}"#, Err(_));
    }

    #[test]
    fn object_is_empty() {
        assert_expr!("{}", Err(_));
    }
}
