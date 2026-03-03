use hashql_core::span::SpanId;
use hashql_diagnostics::Diagnostic;
use text_size::TextRange;

use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{
        error::unexpected_token, syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet,
        token::Token,
    },
    parser::{
        array::error::{
            ArrayDiagnosticCategory, consecutive_commas, leading_commas, trailing_commas,
        },
        complex::{VerifyState, verify_no_repeat},
    },
    span::Span,
};

const EXPECTED_ARRAY_SEP: SyntaxKindSet =
    SyntaxKindSet::from_slice(&[SyntaxKind::Comma, SyntaxKind::RBracket]);

/// Parse an array from the lexer.
///
/// Assumes that the lexer has already consumed the opening bracket.
///
/// # Panics
///
/// Panics if the lexer has not consumed the opening bracket.
#[expect(
    clippy::needless_pass_by_value,
    reason = "API contract, we want to signify to the user, we're now proceeding with this \
              specific token. Not that we hold it temporary, but instead that we consume it."
)]
pub(crate) fn visit_array<'arena, 'source, 'spans, C>(
    state: &mut ParserState<'arena, 'source, 'spans>,
    token: Token<'source>,
    mut on_item: impl FnMut(
        &mut ParserState<'arena, 'source, 'spans>,
    ) -> Result<(), Diagnostic<C, SpanId>>,
) -> Result<TextRange, Diagnostic<C, SpanId>>
where
    C: From<ArrayDiagnosticCategory>,
{
    debug_assert_eq!(token.kind.syntax(), SyntaxKind::LBracket);

    let mut span = token.span;
    let mut index: usize = 0;

    loop {
        let next = state
            .peek_expect(SyntaxKindSet::COMPLETE)
            .change_category(ArrayDiagnosticCategory::Lexer)
            .change_category(C::from)?;

        let (next_kind, next_span) = (next.kind.syntax(), next.span);

        if next_kind == SyntaxKind::RBracket {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .change_category(ArrayDiagnosticCategory::Lexer)
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
                // advance the cursor to the next token and continue as it nothing has happened
                state
                    .advance(SyntaxKindSet::COMPLETE)
                    .change_category(ArrayDiagnosticCategory::Lexer)
                    .change_category(C::from)?;

                verify_no_repeat(
                    state,
                    SyntaxKindSet::from_slice(&[SyntaxKind::Comma]),
                    SyntaxKindSet::from_slice(&[SyntaxKind::RBracket]),
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
                });

                // do not consume the token, so that we can do recoverable parsing (in the future)
                return Err(unexpected_token(span, next_kind, EXPECTED_ARRAY_SEP)
                    .map_category(ArrayDiagnosticCategory::Lexer)
                    .map_category(C::from));
            }
        }

        state.enter(jsonptr::Token::from(index), |state| on_item(state))?;
        index += 1;
    }

    Ok(span)
}

#[cfg(test)]
mod tests {
    use insta::{assert_snapshot, with_settings};
    use text_size::TextSize;

    use crate::{
        ParserState,
        error::ResultExt as _,
        lexer::{error::unexpected_eof, syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
        parser::{
            array::{
                error::{ArrayDiagnostic, ArrayDiagnosticCategory},
                visit::visit_array,
            },
            test::{bind_context, bind_state},
        },
        span::Span,
        test::render_diagnostic,
    };

    #[test]
    fn empty_array() {
        bind_context!(let context = "[]");
        bind_state!(let mut state from context);

        // Get the first token which should be the opening bracket
        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut items_count = 0;
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |_| {
            // This callback should not be called for an empty array
            items_count += 1;
            Ok(())
        });

        let range = result.expect("should be able to parse empty array");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(2));

        assert_eq!(items_count, 0);
    }

    #[test]
    fn single_item_array() {
        bind_context!(let context = "[42]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut items_count = 0;
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKind::Number)
                .expect("should have at least one token");

            items_count += 1;
            Ok(())
        });

        let range = result.expect("should be able to parse single item array");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(4));
        assert_eq!(items_count, 1);
    }

    #[test]
    fn multiple_item_array() {
        bind_context!(let context = "[1, 2, 3]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut items = Vec::new();
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            let token = state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            items.push(token.kind.syntax());
            Ok(())
        });

        let range = result.expect("should be able to parse multiple item array");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(9));
        assert_eq!(
            items,
            [SyntaxKind::Number, SyntaxKind::Number, SyntaxKind::Number]
        );
    }

    #[test]
    fn array_with_different_types() {
        bind_context!(let context = "[1, \"hello\", true, null]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut items = Vec::new();
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            let token = state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            items.push(token.kind.syntax());
            Ok(())
        });

        let range = result.expect("should be able to parse array with different types");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(24));
        assert_eq!(
            items,
            [
                SyntaxKind::Number,
                SyntaxKind::String,
                SyntaxKind::True,
                SyntaxKind::Null
            ]
        );
    }

    #[test]
    fn trailing_comma() {
        bind_context!(let context = "[1, 2,]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut callback_count = 0;
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");

            callback_count += 1;
            Ok(())
        });

        let diagnostic = result.expect_err("should not be able to parse array with trailing comma");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Array with trailing comma should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });

        assert_eq!(callback_count, 2);
    }

    #[test]
    fn missing_comma() {
        bind_context!(let context = "[1 2]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut callback_count = 0;
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            callback_count += 1;
            Ok(())
        });

        let diagnostic = result.expect_err("should not be able to parse array with missing comma");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Array with missing comma should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });

        assert_eq!(callback_count, 1);
    }

    #[test]
    fn error_in_callback() {
        bind_context!(let context = "[1, 2, 3]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut callback_count = 0;
        let result = visit_array(&mut state, token, |state| {
            let token = state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            callback_count += 1;

            if callback_count == 2 {
                return Err(unexpected_eof(
                    state.insert_span(Span {
                        range: token.span,
                        pointer: None,
                    }),
                    SyntaxKindSet::COMPLETE,
                ))
                .change_category(ArrayDiagnosticCategory::Lexer);
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
    fn unclosed_array() {
        bind_context!(let context = "[1, 2");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            Ok(())
        });

        let diagnostic = result.expect_err("should fail with unclosed array");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Unclosed array should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn empty_array_with_whitespace() {
        bind_context!(let context = "[   ]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut items_count = 0;
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |_| {
            items_count += 1;
            Ok(())
        });

        let range = result.expect("should be able to parse empty array with whitespace");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(5));
        assert_eq!(items_count, 0);
    }

    #[test]
    fn array_with_whitespace() {
        bind_context!(let context = "[ 1 , 2 , 3 ]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut items = Vec::new();
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            let token = state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            items.push(token.kind.syntax());
            Ok(())
        });

        let range = result.expect("should be able to parse array with whitespace");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(13));
        assert_eq!(
            items,
            [SyntaxKind::Number, SyntaxKind::Number, SyntaxKind::Number]
        );
    }

    #[test]
    fn nested_arrays() {
        bind_context!(let context = "[[1, 2], [3, 4]]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");
        assert_eq!(token.kind.syntax(), SyntaxKind::LBracket);

        let mut outer_items = Vec::new();
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            let token = state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            outer_items.push(token.kind.syntax());

            if token.kind.syntax() == SyntaxKind::LBracket {
                let mut inner_items = Vec::new();
                let inner_result: Result<_, ArrayDiagnostic> = visit_array(state, token, |state| {
                    let token = state
                        .advance(SyntaxKindSet::COMPLETE)
                        .expect("should have at least one token");
                    inner_items.push(token.kind.syntax());
                    Ok(())
                });

                inner_result.expect("should be able to parse nested array");
                assert!(!inner_items.is_empty(), "Nested array should have items");
            }

            Ok(())
        });

        let range = result.expect("should be able to parse nested arrays");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(16));
        assert_eq!(outer_items, [SyntaxKind::LBracket, SyntaxKind::LBracket]);
    }

    #[expect(clippy::panic_in_result_fn)]
    fn process_nested_array(
        state: &mut ParserState<'_, '_, '_>,
        depth: &mut usize,
    ) -> Result<(), ArrayDiagnostic> {
        *depth += 1;

        let token = state
            .advance(SyntaxKindSet::COMPLETE)
            .expect("should have at least one token");

        if token.kind.syntax() == SyntaxKind::LBracket && *depth < 3 {
            visit_array(state, token, |state| process_nested_array(state, depth)).map(|_| ())
        } else {
            assert_eq!(token.kind.syntax(), SyntaxKind::Number);
            Ok(())
        }
    }

    #[test]
    fn deep_nesting() {
        bind_context!(let context = "[[[1]]]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut depth = 0;

        let result = visit_array(&mut state, token, |state| {
            process_nested_array(state, &mut depth)
        });

        let range = result.expect("should be able to parse deeply nested arrays");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(7));
        assert_eq!(depth, 3);
    }

    #[test]
    fn empty_nested_arrays() {
        bind_context!(let context = "[[], []]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut outer_callback_count = 0;
        let mut inner_callback_count = 0;

        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            let token = state
                .advance(SyntaxKind::LBracket)
                .expect("should have at least one token");

            outer_callback_count += 1;

            visit_array(state, token, |_| {
                inner_callback_count += 1;
                Ok::<(), ArrayDiagnostic>(())
            })
            .expect("should be able to parse empty nested array");

            Ok(())
        });

        let range = result.expect("should be able to parse empty nested arrays");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(8));
        assert_eq!(outer_callback_count, 2);
        assert_eq!(inner_callback_count, 0);
    }

    #[test]
    fn array_with_objects() {
        // This test only checks that object tokens are passed correctly,
        // not that objects are properly parsed (that would be handled by a different function)
        bind_context!(let context = "[{}, {\"key\": 42}]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let mut items = Vec::new();
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            let token = state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            items.push(token.kind.syntax());

            loop {
                let token = state
                    .advance(SyntaxKindSet::COMPLETE)
                    .expect("should have at least one token");
                items.push(token.kind.syntax());

                if token.kind.syntax() == SyntaxKind::RBrace {
                    break;
                }
            }

            Ok(())
        });

        let range = result.expect("should be able to parse array with objects");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(17));
        assert_eq!(
            items,
            [
                SyntaxKind::LBrace,
                SyntaxKind::RBrace,
                SyntaxKind::LBrace,
                SyntaxKind::String,
                SyntaxKind::Colon,
                SyntaxKind::Number,
                SyntaxKind::RBrace
            ]
        );
    }

    #[test]
    fn multiline_array() {
        bind_context!(let context = "[\n  1,\n  2,\n  3\n]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");
        assert_eq!(token.kind.syntax(), SyntaxKind::LBracket);

        let mut items = Vec::new();
        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            let token = state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            items.push(token.kind.syntax());
            Ok(())
        });

        let range = result.expect("should be able to parse multiline array");
        assert_eq!(range.start(), TextSize::new(0));
        assert_eq!(range.end(), TextSize::new(17));
        assert_eq!(
            items,
            [SyntaxKind::Number, SyntaxKind::Number, SyntaxKind::Number]
        );
    }

    #[test]
    fn consecutive_commas() {
        bind_context!(let context = "[1,,2]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            Ok(())
        });

        let diagnostic =
            result.expect_err("should not be able to parse array with consecutive commas");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Array with consecutive commas should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn multiple_consecutive_commas() {
        bind_context!(let context = "[1,,,2]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            Ok(())
        });

        let diagnostic =
            result.expect_err("should not be able to parse array with multiple consecutive commas");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Array with multiple consecutive commas should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn consecutive_trailing_commas() {
        bind_context!(let context = "[1,,]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            Ok(())
        });

        let diagnostic =
            result.expect_err("should not be able to parse array with consecutive commas");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Array with consecutive commas should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn multiple_leading_commas() {
        bind_context!(let context = "[,,1]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            Ok(())
        });

        let diagnostic = result.expect_err("should fail with leading comma");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Array with multiple leading commas should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }

    #[test]
    fn leading_comma() {
        bind_context!(let context = "[,1]");
        bind_state!(let mut state from context);

        let token = state
            .advance(SyntaxKind::LBracket)
            .expect("should have at least one token");

        let result: Result<_, ArrayDiagnostic> = visit_array(&mut state, token, |state| {
            state
                .advance(SyntaxKindSet::COMPLETE)
                .expect("should have at least one token");
            Ok(())
        });

        let diagnostic = result.expect_err("should fail with leading comma");
        let report = render_diagnostic(context.input, &diagnostic, &context.spans);

        with_settings!({
            description => "Array with leading comma should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, &context.input);
        });
    }
}
