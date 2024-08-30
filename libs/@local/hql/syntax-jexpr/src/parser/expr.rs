use alloc::borrow::Cow;

use hql_cst::expr::{call::Call, Expr, ExprKind};
use hql_diagnostics::Diagnostic;
use hql_span::{SpanId, TextRange};
use winnow::{
    error::{ContextError, ErrMode, ParseError},
    Located, Parser,
};

use super::{
    array::parse_array, error::unexpected_token, expr_explicit::parse_expr_explicit,
    stream::TokenStream,
};
use crate::{
    lexer::{syntax_kind::SyntaxKind, token::Token, token_kind::TokenKind},
    parser::{
        error::{expected_callee, invalid_identifier, invalid_signature},
        path::parse_path,
        signature::parse_signature,
        string::ParseState,
        symbol::ParseRestriction,
        IntoTextRange,
    },
    span::Span,
};

pub(crate) fn parse_expr<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
    token: Option<Token<'source>>,
) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let token = if let Some(token) = token {
        token
    } else {
        stream.next_or_err()?
    };

    match token.kind {
        TokenKind::String(value) => parse_string(stream, &value, token.span),
        TokenKind::LBracket => parse_call(stream, token),
        TokenKind::LBrace => parse_expr_explicit(stream, token),
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

fn parse_call<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
    token: Token<'source>,
) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let mut r#fn = None;
    let mut args = stream.arena.vec(None);

    let span = parse_array(stream, token, |stream, token| {
        let node = parse_expr(stream, token)?;

        match r#fn {
            Some(..) => args.push(node),
            None => r#fn = Some(node),
        }

        Ok(())
    })?;

    let span = stream.insert_span(Span {
        range: span,
        pointer: stream.pointer(),
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

fn parse_string<'arena, 'source>(
    stream: &TokenStream<'arena, 'source>,
    value: &Cow<'source, str>,
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

    let span = Span {
        range: span,
        pointer: stream.pointer(),
        parent_id: None,
    };
    let parent_id = stream.insert_span(span);

    let input = winnow::Stateful {
        input: Located::new(value.as_ref()),
        state: ParseState {
            arena: stream.arena,
            spans: &stream.spans,
            parent_id: Some(parent_id),
        },
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

    let (decision, error): (_, ParseError<_, ErrMode<ContextError>>) = match result {
        Ok(kind) => {
            return Ok(Expr {
                kind,
                span: parent_id,
            });
        }
        Err((decision, error)) => (decision, error),
    };

    let span = {
        let start = error.offset();
        let end = value.len().min(start);

        Span {
            range: (start, end).range_trunc(),
            pointer: None,
            parent_id: Some(parent_id),
        }
    };

    let span = stream.insert_span(span);

    let diagnostic = match decision {
        ParseDecision::Path => invalid_identifier(span, &error),
        ParseDecision::Signature => invalid_signature(span, &error),
    };

    Err(diagnostic)
}

#[cfg(test)]
mod test {
    #![expect(clippy::string_lit_as_bytes, reason = "macro code")]
    use alloc::sync::Arc;
    use std::assert_matches::assert_matches;

    use hql_cst::arena::Arena;
    use hql_diagnostics::{config::ReportConfig, span::DiagnosticSpan};
    use hql_span::storage::SpanStorage;
    use insta::{assert_debug_snapshot, assert_snapshot};

    use super::ExprKind;
    use crate::{
        lexer::Lexer,
        parser::{parse_expr, TokenStream},
        span::Span,
    };

    // This needs to be a macro, because we need to get the function name for auto-naming.
    macro_rules! assert_expr {
        ($expr:expr,Err(_)) => {{
            let arena = Arena::new();
            let spans = Arc::new(SpanStorage::new());
            let lexer = Lexer::new($expr.as_bytes(), Arc::clone(&spans));

            let diagnostic = parse_expr(
                &mut TokenStream {
                    arena: &arena,
                    lexer,
                    spans: Arc::clone(&spans),
                    stack: Some(Vec::new()),
                },
                None,
            )
            .expect_err("should not be able to parse expression");

            let diagnostic = diagnostic
                .resolve(&spans)
                .expect("should be able to resolve all spans");

            let report = diagnostic.report(
                ReportConfig {
                    color: false,
                    ..Default::default()
                }
                .with_transform_span(|span: &Span| DiagnosticSpan::from(span)),
            );

            let mut buffer = Vec::new();
            report
                .write_for_stdout(ariadne::Source::from($expr), &mut buffer)
                .expect("should be able to write to buffer");

            let output =
                String::from_utf8(buffer).expect("should be able to convert buffer to string");

            assert_snapshot!(insta::_macro_support::AutoName, output, $expr);
        }};

        ($expr:expr, $pattern:pat) => {{
            let arena = Arena::new();
            let spans = Arc::new(SpanStorage::new());
            let lexer = Lexer::new($expr.as_bytes(), Arc::clone(&spans));

            let expr = parse_expr(
                &mut TokenStream {
                    arena: &arena,
                    lexer,
                    spans,
                    stack: Some(Vec::new()),
                },
                None,
            )
            .expect("should be able to parse expression");

            assert_debug_snapshot!(insta::_macro_support::AutoName, expr, $expr);

            assert_matches!(expr.kind, $pattern);
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
            ExprKind::Call(_)
        );
    }

    #[test]
    fn fn_empty_args() {
        assert_expr!(r#"["func"]"#, ExprKind::Call(_));
    }

    #[test]
    fn fn_empty() {
        assert_expr!("[]", Err(_));
    }

    #[test]
    fn string_is_path() {
        assert_expr!(r#""symbol""#, ExprKind::Path(_));

        assert_expr!(r#""foo::bar""#, ExprKind::Path(_));
    }

    #[test]
    fn string_is_signature() {
        assert_expr!(r#""<T: Int>(a: T) -> T""#, ExprKind::Signature(_));
    }

    #[test]
    fn string_is_invalid() {
        assert_expr!(r#""1234""#, Err(_));
    }

    #[test]
    fn object_is_constant() {
        assert_expr!(r#"{"const": 42}"#, ExprKind::Constant(_));
    }

    #[test]
    fn object_is_constant_with_type() {
        assert_expr!(r#"{"type": "u32", "const": 42}"#, ExprKind::Constant(_));
    }

    #[test]
    fn object_is_constant_with_extra_fields() {
        assert_expr!(
            r#"{"type": "u32", "const": 42, "sig": "() -> Unit"}"#,
            Err(_)
        );
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
