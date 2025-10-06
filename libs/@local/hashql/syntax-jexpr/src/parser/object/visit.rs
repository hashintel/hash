use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::Diagnostic;
use text_size::TextRange;

use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{
        error::unexpected_token, syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet,
        token::Token, token_kind::TokenKind,
    },
    parser::{
        complex::{VerifyState, verify_no_repeat},
        object::error::{
            ObjectDiagnosticCategory, consecutive_colons, consecutive_commas, leading_commas,
            trailing_commas,
        },
    },
    span::Span,
};

const EXPECTED_OBJECT_SEP: SyntaxKindSet =
    SyntaxKindSet::from_slice(&[SyntaxKind::Comma, SyntaxKind::RBrace]);

pub(crate) struct Key<'source> {
    pub value: Cow<'source, str>,
    pub span: TextRange,
}

pub(crate) fn visit_object_entry<'arena, 'source, C>(
    state: &mut ParserState<'arena, 'source>,
    on_item: &mut impl FnMut(
        &mut ParserState<'arena, 'source>,
        Key<'source>,
    ) -> Result<(), Diagnostic<C, SpanId>>,
) -> Result<(), Diagnostic<C, SpanId>>
where
    C: From<ObjectDiagnosticCategory>,
{
    // First get the key, then the value (separated by a colon)
    let key = state
        .advance(SyntaxKind::String)
        .change_category(ObjectDiagnosticCategory::Lexer)
        .change_category(C::from)?;

    let key_span = key.span;

    let TokenKind::String(key) = key.kind else {
        unreachable!()
    };

    state
        .advance(SyntaxKind::Colon)
        .change_category(ObjectDiagnosticCategory::Lexer)
        .change_category(C::from)?;

    verify_no_repeat(
        state,
        SyntaxKindSet::from_slice(&[SyntaxKind::Colon]),
        SyntaxKindSet::EMPTY,
        |_, spans, _| consecutive_colons(&spans),
    )
    .change_category(C::from)?;

    let key = Key {
        value: key,
        span: key_span,
    };

    state.enter(
        jsonptr::Token::from(key.value.clone().into_owned()),
        |state| on_item(state, key),
    )?;

    Ok(())
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "API contract, we want to signify to the user, we're now proceeding with this \
              specific token. Not that we hold it temporary, but instead that we consume it."
)]
pub(crate) fn visit_object<'arena, 'source, C>(
    state: &mut ParserState<'arena, 'source>,
    token: Token<'source>,
    mut on_item: impl FnMut(
        &mut ParserState<'arena, 'source>,
        Key<'source>,
    ) -> Result<(), Diagnostic<C, SpanId>>,
) -> Result<TextRange, Diagnostic<C, SpanId>>
where
    C: From<ObjectDiagnosticCategory>,
{
    debug_assert_eq!(token.kind.syntax(), SyntaxKind::LBrace);

    let mut span = token.span;
    let mut index: usize = 0;

    loop {
        let next = state
            .peek_expect(SyntaxKindSet::COMPLETE)
            .change_category(ObjectDiagnosticCategory::Lexer)
            .change_category(C::from)?;

        let (next_kind, next_span) = (next.kind.syntax(), next.span);

        if next_kind == SyntaxKind::RBrace {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .change_category(ObjectDiagnosticCategory::Lexer)
                .change_category(C::from)?;

            span = span.cover(next_span);
            break;
        }

        if index == 0 {
            verify_no_repeat(
                state,
                SyntaxKindSet::from_slice(&[SyntaxKind::Comma]),
                SyntaxKindSet::EMPTY,
                |_, spans, _| leading_commas(&spans),
            )
            .change_category(C::from)?;
        } else {
            // we need to check if the next token is a comma
            // in case it isn't we error out
            if next_kind == SyntaxKind::Comma {
                state
                    .advance(SyntaxKindSet::COMPLETE)
                    .change_category(ObjectDiagnosticCategory::Lexer)
                    .change_category(C::from)?;

                verify_no_repeat(
                    state,
                    SyntaxKindSet::from_slice(&[SyntaxKind::Comma]),
                    SyntaxKindSet::from_slice(&[SyntaxKind::RBrace]),
                    |state, mut spans, verify| match verify {
                        VerifyState::Trailing => {
                            // if trailing comma is found, then the first comma is also affected
                            spans.insert(0, state.insert_range(next_span));
                            trailing_commas(&spans)
                        }
                        VerifyState::Consecutive => consecutive_commas(&spans),
                    },
                )
                .change_category(C::from)?;
            } else {
                let span = state.insert_span(Span {
                    range: next_span,
                    pointer: Some(state.current_pointer()),
                    parent_id: None,
                });

                // do not consume the token, so that we can do recoverable parsing (in the future)
                return Err(unexpected_token(span, next_kind, EXPECTED_OBJECT_SEP)
                    .map_category(ObjectDiagnosticCategory::Lexer)
                    .map_category(C::from));
            }
        }

        visit_object_entry(state, &mut on_item)?;

        index += 1;
    }

    Ok(span)
}

#[cfg(test)]
mod tests {

    use insta::{assert_snapshot, with_settings};
    use text_size::TextSize;

    use crate::{
        error::ResultExt as _,
        lexer::{error::unexpected_eof, syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
        parser::{
            object::{
                error::{ObjectDiagnostic, ObjectDiagnosticCategory},
                visit::{Key, visit_object},
            },
            test::{bind_context, bind_state},
        },
        span::Span,
        test::render_diagnostic,
    };

    macro advance {
        ($state:ident) => {
            $state.advance(SyntaxKindSet::COMPLETE).expect("should have at least one token")
        },
        ($state:ident == $token:expr) => {{
            let token = $state.advance($token).expect("should have at least one token");

            token
        }}
    }

    #[test]
    fn empty_object() {
        bind_context!(let context = "{}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut entries_count = 0;
        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |_, _| {
            // This callback should not be called for an empty object
            entries_count += 1;
            Ok(())
        });

        let range = result.expect("should be able to parse empty object");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(2));

        assert_eq!(entries_count, 0);
    }

    #[test]
    fn single_entry_object() {
        bind_context!(let context = "{\"key\": 42}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut entries = Vec::new();
        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                entries.push(key.to_string());

                advance!(state == SyntaxKind::Number);

                Ok(())
            });

        let range = result.expect("should be able to parse single entry object");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(11));
        assert_eq!(entries, vec!["key"]);
    }

    #[test]
    fn multiple_entry_object() {
        bind_context!(let context = "{\"a\": 1, \"b\": true, \"c\": \"hello\"}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut entries = Vec::new();
        let mut values = Vec::new();

        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                entries.push(key.to_string());

                let token = advance!(state);
                values.push(token.kind.syntax());

                Ok(())
            });

        let range = result.expect("should be able to parse multiple entry object");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(33));
        assert_eq!(entries, vec!["a", "b", "c"]);
        assert_eq!(
            values,
            vec![SyntaxKind::Number, SyntaxKind::True, SyntaxKind::String]
        );
    }

    #[test]
    fn object_with_different_value_types() {
        bind_context!(let context = "{\"num\": 42, \"str\": \"hello\", \"bool\": true, \"null\": null}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut entries = Vec::new();
        let mut values = Vec::new();

        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                entries.push(key.into_owned());

                let token = advance!(state);
                values.push(token.kind.syntax());

                Ok(())
            });

        let range = result.expect("should be able to parse object with different value types");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(55));
        assert_eq!(entries, vec!["num", "str", "bool", "null"]);
        assert_eq!(
            values,
            vec![
                SyntaxKind::Number,
                SyntaxKind::String,
                SyntaxKind::True,
                SyntaxKind::Null
            ]
        );
    }

    #[test]
    fn trailing_comma() {
        bind_context!(let context = "{\"a\": 1, \"b\": 2,}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut callback_count = 0;
        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |state, _| {
            advance!(state);
            callback_count += 1;
            Ok(())
        });

        let diagnostic =
            result.expect_err("should not be able to parse object with trailing comma");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Object with trailing comma should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });

        assert_eq!(callback_count, 2);
    }

    #[test]
    fn missing_comma() {
        bind_context!(let context = "{\"a\": 1 \"b\": 2}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut callback_count = 0;
        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |state, _| {
            advance!(state);
            callback_count += 1;
            Ok(())
        });

        let diagnostic = result.expect_err("should not be able to parse object with missing comma");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Object with missing comma should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });

        assert_eq!(callback_count, 1);
    }

    #[test]
    fn missing_colon() {
        bind_context!(let context = "{\"a\" 1}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |state, _| {
            advance!(state);
            Ok(())
        });

        let diagnostic = result.expect_err("should not be able to parse object with missing colon");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Object with missing colon should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn consecutive_colons() {
        bind_context!(let context = "{\"a\":: 1}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |state, _| {
            advance!(state);
            Ok(())
        });

        let diagnostic =
            result.expect_err("should not be able to parse object with consecutive colons");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Object with consecutive colons should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn error_in_callback() {
        bind_context!(let context = "{\"a\": 1, \"b\": 2}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut callback_count = 0;
        let result = visit_object(&mut state, token, |state, Key { value: key, .. }| {
            let token = advance!(state);
            callback_count += 1;

            if key == "b" {
                return Err(unexpected_eof(
                    state.insert_span(Span {
                        range: token.span,
                        pointer: None,
                        parent_id: None,
                    }),
                    SyntaxKindSet::COMPLETE,
                ))
                .change_category(ObjectDiagnosticCategory::Lexer);
            }

            Ok(())
        });

        assert!(result.is_err(), "should propagate error from callback");
        assert_eq!(
            callback_count, 2,
            "callback should be called twice before error"
        );
    }

    #[test]
    fn unclosed_object() {
        bind_context!(let context = "{\"a\": 1");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |state, _| {
            advance!(state);
            Ok(())
        });

        let diagnostic = result.expect_err("should fail with unclosed object");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Unclosed object should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn empty_object_with_whitespace() {
        bind_context!(let context = "{   }");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut entries_count = 0;
        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |_, _| {
            entries_count += 1;
            Ok(())
        });

        let range = result.expect("should be able to parse empty object with whitespace");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(5));
        assert_eq!(entries_count, 0);
    }

    #[test]
    fn object_with_whitespace() {
        bind_context!(let context = "{ \"a\" : 1 , \"b\" : 2 }");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut entries = Vec::new();
        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                entries.push(key.into_owned());
                advance!(state);
                Ok(())
            });

        let range = result.expect("should be able to parse object with whitespace");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(21));
        assert_eq!(entries, vec!["a", "b"]);
    }

    #[test]
    fn nested_objects() {
        bind_context!(let context = "{\"a\": {\"b\": 1}, \"c\": {\"d\": 2}}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut outer_entries = Vec::new();
        let mut inner_entries = Vec::new();

        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                outer_entries.push(key.into_owned());

                let token = advance!(state);

                if token.kind.syntax() == SyntaxKind::LBrace {
                    visit_object(
                        state,
                        token,
                        |state,
                         Key {
                             value: inner_key, ..
                         }| {
                            inner_entries.push(inner_key.into_owned());
                            advance!(state);
                            Ok::<(), ObjectDiagnostic>(())
                        },
                    )
                    .expect("should be able to parse nested object");
                }

                Ok(())
            });

        let range = result.expect("should be able to parse nested objects");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(30));
        assert_eq!(outer_entries, vec!["a", "c"]);
        assert_eq!(inner_entries, vec!["b", "d"]);
    }

    #[test]
    fn empty_nested_objects() {
        bind_context!(let context = "{\"a\": {}, \"b\": {}}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut outer_entries = Vec::new();
        let mut inner_entries = Vec::new();

        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                outer_entries.push(key.into_owned());

                let token = advance!(state == SyntaxKind::LBrace);

                visit_object(
                    state,
                    token,
                    |_,
                     Key {
                         value: inner_key, ..
                     }| {
                        inner_entries.push(inner_key.into_owned());
                        Ok::<(), ObjectDiagnostic>(())
                    },
                )
                .expect("should be able to parse nested empty object");

                Ok(())
            });

        let range = result.expect("should be able to parse empty nested objects");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(18));
        assert_eq!(outer_entries, vec!["a", "b"]);
        assert_eq!(inner_entries, Vec::<String>::new());
    }

    #[test]
    fn object_with_arrays() {
        bind_context!(let context = "{\"a\": [], \"b\": [1, 2]}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut entries = Vec::new();
        let mut array_tokens = Vec::new();

        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                entries.push(key.into_owned());

                advance!(state == SyntaxKind::LBracket);

                loop {
                    let token = advance!(state);
                    if token.kind.syntax() == SyntaxKind::RBracket {
                        break;
                    }

                    array_tokens.push(token.kind.syntax());
                }

                Ok(())
            });

        let range = result.expect("should be able to parse object with arrays");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(22));
        assert_eq!(entries, vec!["a", "b"]);
        assert_eq!(
            array_tokens,
            vec![SyntaxKind::Number, SyntaxKind::Comma, SyntaxKind::Number]
        );
    }

    #[test]
    fn multiline_object() {
        bind_context!(let context = "{\n  \"a\": 1,\n  \"b\": 2\n}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut entries = Vec::new();
        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                entries.push(key.into_owned());
                advance!(state);
                Ok(())
            });

        let range = result.expect("should be able to parse multiline object");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(22));
        assert_eq!(entries, vec!["a", "b"]);
    }

    #[test]
    fn consecutive_commas() {
        bind_context!(let context = "{\"a\": 1,,\"b\": 2}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |state, _| {
            advance!(state);
            Ok(())
        });

        let diagnostic =
            result.expect_err("should not be able to parse object with consecutive commas");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Object with consecutive commas should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn leading_comma() {
        bind_context!(let context = "{,\"a\": 1}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |state, _| {
            advance!(state);
            Ok(())
        });

        let diagnostic = result.expect_err("should fail with leading comma");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Object with leading comma should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn multiple_leading_commas() {
        bind_context!(let context = "{,,\"a\": 1}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |state, _| {
            advance!(state);
            Ok(())
        });

        let diagnostic = result.expect_err("should fail with multiple leading commas");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Object with multiple leading commas should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn non_string_key() {
        bind_context!(let context = "{42: \"value\"}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let result: Result<_, ObjectDiagnostic> = visit_object(&mut state, token, |_, _| Ok(()));

        let diagnostic =
            result.expect_err("should not be able to parse object with non-string key");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Object with non-string key should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn duplicate_keys() {
        bind_context!(let context = "{\"a\": 1, \"a\": 2}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut seen_keys = Vec::new();
        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                seen_keys.push(key.into_owned());
                advance!(state);
                Ok(())
            });

        // Note: JSON technically allows duplicate keys, though it's discouraged
        let range = result
            .expect("should be able to parse object with duplicate keys (though it's discouraged)");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(16));
        assert_eq!(seen_keys, vec!["a", "a"]);
    }

    #[test]
    fn empty_key() {
        bind_context!(let context = "{\"\": 42}");
        bind_state!(let mut state from context);

        let token = advance!(state == SyntaxKind::LBrace);

        let mut seen_keys = Vec::new();
        let result: Result<_, ObjectDiagnostic> =
            visit_object(&mut state, token, |state, Key { value: key, .. }| {
                seen_keys.push(key.into_owned());
                advance!(state);
                Ok(())
            });

        let range = result.expect("should be able to parse object with empty key");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(8));
        assert_eq!(seen_keys, vec![""]);
    }
}
