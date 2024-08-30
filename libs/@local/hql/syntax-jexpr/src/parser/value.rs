use hql_cst::{
    arena,
    value::{ObjectKey, Value, ValueKind},
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
    let mut object: arena::HashMap<ObjectKey<'source>, Value<'arena, 'source>> =
        stream.arena.hash_map(None);

    let span = parse_object(stream, token, |stream, key| {
        if let Some((existing_key, _)) = object.get_key_value(&*key.value) {
            let span = stream.insert_span(Span {
                range: key.span,
                pointer: stream.pointer(),
                parent_id: None,
            });

            return Err(duplicate_key(span, existing_key.span));
        }

        let key_span = stream.insert_span(Span {
            range: key.span,
            pointer: stream.pointer(),
            parent_id: None,
        });

        let value = parse_value(stream, None)?;
        object.insert(
            ObjectKey {
                span: key_span,
                value: key.value,
            },
            value,
        );
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

#[cfg(test)]
mod test {
    #![expect(
        clippy::integer_division_remainder_used,
        reason = "used in test-fuzz macro"
    )]
    use alloc::sync::Arc;

    use hql_cst::{
        arena::Arena,
        value::{Value, ValueKind},
    };
    use hql_diagnostics::{config::ReportConfig, span::DiagnosticSpan, Diagnostic};
    use hql_span::{storage::SpanStorage, SpanId};
    use insta::assert_snapshot;

    use super::parse_value;
    use crate::{
        lexer::Lexer,
        parser::{
            error::{expected_eof, DUPLICATE_KEY},
            TokenStream,
        },
        span::Span,
    };

    #[expect(
        clippy::float_arithmetic,
        reason = "difference comparison for equality"
    )]
    fn partial_eq(lhs: &Value, rhs: &serde_json::Value) -> bool {
        match (&lhs.kind, rhs) {
            (ValueKind::Bool(a), serde_json::Value::Bool(b)) => a == b,
            (ValueKind::Null, serde_json::Value::Null) => true,
            (ValueKind::Number(a), serde_json::Value::Number(b)) => {
                let Some(b) = b.as_f64() else {
                    return false;
                };

                f64::abs(a.as_f64_lossy() - b) < f64::EPSILON
            }
            (ValueKind::String(a), serde_json::Value::String(b)) => a == b,
            (ValueKind::Array(a), serde_json::Value::Array(b)) => {
                a.iter().zip(b.iter()).all(|(a, b)| partial_eq(a, b))
            }
            (ValueKind::Object(a), serde_json::Value::Object(b)) => a
                .iter()
                .all(|(k, v)| b.get(k.value.as_ref()).map_or(false, |b| partial_eq(v, b))),
            _ => false,
        }
    }

    fn parse_complete<'arena, 'source>(
        arena: &'arena Arena,
        spans: Arc<SpanStorage<Span>>,
        source: &'source str,
    ) -> Result<Value<'arena, 'source>, Diagnostic<'static, SpanId>> {
        let mut stream = TokenStream {
            arena,
            lexer: Lexer::new(source.as_bytes(), Arc::clone(&spans)),
            spans,
            stack: Some(Vec::new()),
        };

        let value = parse_value(&mut stream, None)?;
        if stream.lexer.advance().is_some() {
            let span = stream.insert_span(Span {
                range: stream.lexer.span(),
                pointer: stream.pointer(),
                parent_id: None,
            });

            // early eof is not handled by the parser itself
            return Err(expected_eof(span));
        }

        Ok(value)
    }

    #[test_fuzz::test_fuzz]
    fn assert_eq_serde(input: &str) {
        let input = input.trim_end(); // we ignore whitespace, serde_json does not
        let arena = Arena::new();
        let spans = Arc::new(SpanStorage::new());

        let value_result = parse_complete(&arena, spans, input);
        let serde_result = serde_json::from_str::<serde_json::Value>(input);

        if let Err(error) = &serde_result {
            // serde_json number out of range is normal, because we don't have any precision checks
            // (we save it as a string for later)
            if error.to_string().contains("number out of range") {
                return;
            }

            if input.contains('\u{c}') {
                // serde_json does not support form feed, we do
                return;
            }
        }

        if let Err(diagnostic) = &value_result {
            let is_duplicate = diagnostic.category.as_ref().id == DUPLICATE_KEY.id;

            if is_duplicate {
                // we error out on duplicate keys, serde_json does not
                return;
            }
        }

        match (value_result, serde_result) {
            (Ok(a), Ok(b)) => assert!(partial_eq(&a, &b)),
            (Err(_), Err(_)) => {}
            (value, serde) => {
                panic!("input: {input:?}\nvalue: {value:?}\nserde: {serde:?}");
            }
        };
    }

    const INPUT: &str = r#"
    [
      {
        "Name": "Edward the Elder",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "899-925",
        "ID": 1
      },
      {
        "Name": "Athelstan",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "925-940",
        "ID": 2
      },
      {
        "Name": "Edmund",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "940-946",
        "ID": 3
      },
      {
        "Name": "Edred",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "946-955",
        "ID": 4
      },
      {
        "Name": "Edwy",
        "Country": "United Kingdom",
        "House": "House of Wessex",
        "Reign": "955-959",
        "ID": 5
      }
    ]"#;

    #[test]
    fn serde_integration() {
        // ensure that everything that serde can parse, we can parse as well
        assert_eq_serde(INPUT);
        assert_eq_serde("[[");
        assert_eq_serde("[[[]]");
        assert_eq_serde("{}");
        assert_eq_serde("{}}");
        assert_eq_serde(r#"{12: "12"}"#);
    }

    fn expect_err(expr: &str) -> String {
        let arena = Arena::new();
        let spans = Arc::new(SpanStorage::new());

        let diagnostic = parse_complete(&arena, Arc::clone(&spans), expr)
            .expect_err("number should not be a valid key");

        let diagnostic = diagnostic
            .resolve(&spans)
            .expect("should have all spans in storage");

        let report = diagnostic.report(
            ReportConfig {
                color: false,
                ..ReportConfig::default()
            }
            .with_transform_span(|span: &Span| DiagnosticSpan::from(span)),
        );

        let mut output = Vec::new();
        report
            .write_for_stdout(ariadne::Source::from(expr), &mut output)
            .expect("should be able to output to vec");

        String::from_utf8(output).expect("should be valid utf8")
    }

    #[test]
    fn key_is_number() {
        let expr = r#"{12: "12"}"#;

        assert_snapshot!(insta::_macro_support::AutoName, expect_err(expr), expr);
    }

    #[test]
    fn duplicate_key() {
        let expr = r#"{"a": 1, "a": b}"#;

        assert_snapshot!(insta::_macro_support::AutoName, expect_err(expr), expr);
    }
}
