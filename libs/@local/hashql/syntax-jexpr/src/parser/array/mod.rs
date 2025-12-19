pub(crate) mod error;
pub(crate) mod visit;

use hashql_ast::node::{
    expr::{
        CallExpr, Expr, ExprKind,
        call::{Argument, LabeledArgument},
    },
    id::NodeId,
    path::{Path, PathSegment},
};
use hashql_core::heap::CollectIn as _;

use self::{
    error::{
        empty, labeled_argument_invalid_identifier, labeled_argument_missing_prefix,
        labeled_arguments_length_mismatch,
    },
    visit::visit_array,
};
use super::{error::ParserDiagnostic, string::parse_ident_labelled_argument_from_string};
use crate::{
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, token::Token, token_kind::TokenKind},
    parser::{
        error::ParserDiagnosticCategory, expr::parse_expr, object::visit::visit_object,
        state::ParserState,
    },
    span::Span,
};

fn parse_labelled_argument_shorthand<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
) -> Result<Vec<LabeledArgument<'heap>>, ParserDiagnostic> {
    let token = state
        .advance(SyntaxKind::String)
        .change_category(From::from)?;

    let TokenKind::String(value) = token.kind else {
        unreachable!()
    };

    let token_span = state.insert_range(token.span);
    let key = match parse_ident_labelled_argument_from_string(state, token_span, &value) {
        Ok(value) => value,
        Err(error) => {
            let error = (error.offset(), error.into_inner());

            return Err(
                labeled_argument_invalid_identifier(state.spans(), token_span, error)
                    .map_category(From::from),
            );
        }
    };

    Ok(vec![LabeledArgument {
        id: NodeId::PLACEHOLDER,
        span: token_span,
        label: key,
        value: Argument {
            id: NodeId::PLACEHOLDER,
            span: token_span,
            value: Box::new_in(
                Expr {
                    id: NodeId::PLACEHOLDER,
                    span: token_span,
                    kind: ExprKind::Path(Path {
                        id: NodeId::PLACEHOLDER,
                        span: token_span,
                        rooted: false,
                        segments: {
                            let mut segments = Vec::with_capacity_in(1, state.heap());
                            segments.push(PathSegment {
                                id: NodeId::PLACEHOLDER,
                                span: token_span,
                                name: key,
                                arguments: Vec::new_in(state.heap()),
                            });
                            segments
                        },
                    }),
                },
                state.heap(),
            ),
        },
    }])
}

// Peek twice, we know if it's a labeled argument if the first token is `{` and the second a
// string that starts with `:`.
fn parse_labelled_argument<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
) -> Result<Option<Vec<LabeledArgument<'heap>>>, ParserDiagnostic> {
    let Some(peek1) = state
        .peek()
        .change_category(ParserDiagnosticCategory::Lexer)?
    else {
        return Ok(None);
    };

    // absolute paths start with `::`, so ignore them
    if let TokenKind::String(peek1) = &peek1.kind
        && peek1.starts_with(':')
        && !peek1.starts_with("::")
    {
        return parse_labelled_argument_shorthand(state).map(Some);
    }

    if peek1.kind.syntax() != SyntaxKind::LBrace {
        return Ok(None);
    }

    let Some(peek2) = state
        .peek2()
        .change_category(ParserDiagnosticCategory::Lexer)?
    else {
        return Ok(None);
    };

    let TokenKind::String(key) = &peek2.kind else {
        return Ok(None);
    };

    if !key.starts_with(':') {
        return Ok(None);
    }

    let token = state
        .advance(SyntaxKind::LBrace)
        .change_category(From::from)?;

    let mut labeled_arguments = Vec::new();

    let range = visit_object(state, token, |state, key| {
        if !key.value.starts_with(':') {
            return Err(
                labeled_argument_missing_prefix(state.insert_range(key.span), key.value)
                    .map_category(From::from),
            );
        }

        let mut label_span = key.span;

        let key_span = state.insert_range(key.span);
        let key = match parse_ident_labelled_argument_from_string(state, key_span, &key.value) {
            Ok(value) => value,
            Err(error) => {
                let error = (error.offset(), error.into_inner());
                return Err(
                    labeled_argument_invalid_identifier(state.spans(), key_span, error)
                        .map_category(From::from),
                );
            }
        };

        let value = parse_expr(state)?;
        label_span = label_span.cover(state.current_span());

        labeled_arguments.push(LabeledArgument {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(label_span),
            label: key,
            value: Argument {
                id: NodeId::PLACEHOLDER,
                span: value.span,
                value: Box::new_in(value, state.heap()),
            },
        });

        Ok(())
    })?;

    if labeled_arguments.len() != 1 {
        return Err(labeled_arguments_length_mismatch(
            state.insert_range(range),
            labeled_arguments
                .iter()
                .skip(1)
                .map(|argument| argument.span),
            labeled_arguments.len(),
        )
        .map_category(From::from));
    }

    Ok(Some(labeled_arguments))
}

pub(crate) fn parse_array<'heap, 'source>(
    state: &mut ParserState<'heap, 'source, '_>,
    token: Token<'source>,
) -> Result<Expr<'heap>, ParserDiagnostic> {
    debug_assert_eq!(token.kind.syntax(), SyntaxKind::LBracket);

    let mut function = None;
    let mut arguments = Vec::new();
    let mut labeled_arguments = Vec::new();

    let span = visit_array(state, token, |state| {
        match &mut function {
            Some(_) => {
                if let Some(labeled) = parse_labelled_argument(state)? {
                    labeled_arguments.extend(labeled);
                    return Ok(());
                }

                let expr = parse_expr(state)?;

                arguments.push(Argument {
                    id: NodeId::PLACEHOLDER,
                    span: expr.span,
                    value: Box::new_in(expr, state.heap()),
                });
            }
            function @ None => *function = Some(parse_expr(state)?),
        }

        Ok(())
    })
    .change_category(From::from)?;

    let span = state.insert_span(Span {
        range: span,
        pointer: Some(state.current_pointer()),
    });

    let Some(function) = function else {
        return Err(empty(span).map_category(From::from));
    };

    let heap = state.heap();

    Ok(Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Call(CallExpr {
            id: NodeId::PLACEHOLDER,
            span,
            function: Box::new_in(function, heap),
            arguments: arguments.into_iter().collect_in(heap),
            labeled_arguments: labeled_arguments.into_iter().collect_in(heap),
        }),
    })
}

#[cfg(test)]
mod tests {
    use hashql_ast::format::SyntaxDump as _;
    use insta::{assert_snapshot, with_settings};

    use crate::{
        lexer::syntax_kind::SyntaxKind,
        parser::{array::parse_array, test::bind_parser},
    };

    bind_parser!(fn run_array(parse_array, SyntaxKind::LBracket));

    #[test]
    fn parse_basic_function_call() {
        // ["add", 1, 2] - Basic function call structure
        let result = run_array(r##"["add", {"#literal": 1}, {"#literal": 2}]"##)
            .expect("should parse successfully");

        with_settings!({
            description => "Parses a basic function call with proper literal syntax"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_empty_array() {
        // [] - Empty array should error (as it has no function)
        let error = run_array("[]").expect_err("should fail on empty array");

        with_settings!({
            description => "Empty arrays are not valid J-Expr function calls"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_function_call_with_labeled_arguments() {
        // Function call with labeled arguments
        let result = run_array(
            r##"["greet", {":name": {"#literal": "Alice"}}, {":age": {"#literal": 30}}]"##,
        )
        .expect("should parse successfully");

        with_settings!({
            description => "Parses a function call with labeled arguments"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_function_call_with_labeled_arguments_shorthand() {
        // Function call with labeled arguments
        let result = run_array(r#"["greet", "age", ":name"]"#).expect("should parse successfully");

        with_settings!({
            description => "Parses a function call with labeled arguments"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_function_call_with_multiple_labeled_arguments() {
        // Function call with labeled arguments
        let error = run_array(
            r##"
                ["greet",
                    {":age": {"#literal": 30},
                     ":gender": {"#literal": "non-binary"}
                    }
                ]"##,
        )
        .expect_err("should fail to parse");

        with_settings!({
            description => "Multiple labeled arguments cannot exist in a single object"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_function_call_with_empty_object() {
        // Function call with labeled arguments
        let error = run_array(r#"["greet", {}]"#).expect_err("should fail to parse");

        with_settings!({
            description => "Empty objects are not allowed"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_function_call_mixed_arguments() {
        // Function call with both positional and labeled arguments
        let result =
            run_array(r##"["format", {"#literal": "template"}, {":value": {"#literal": 42}}]"##)
                .expect("should parse successfully");

        with_settings!({
            description => "Parses a function call with mixed positional and labeled arguments"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_nested_function_calls() {
        // Nested function calls
        let result = run_array(
            r##"["add", ["multiply", {"#literal": 2}, {"#literal": 3}], {"#literal": 5}]"##,
        )
        .expect("should parse successfully");

        with_settings!({
            description => "Parses nested function calls"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_labeled_argument_missing_prefix() {
        // Missing ":" prefix in labeled argument
        let error = run_array(r##"["greet", {"name": {"#literal": "Alice"}}]"##)
            .expect_err("should fail with missing prefix");

        with_settings!({
            description => "Labeled arguments must start with ':'"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_labeled_argument_invalid_identifier() {
        // Invalid identifier starting with digit
        let error = run_array(r##"["func", {":123": {"#literal": "value"}}]"##)
            .expect_err("should fail with invalid identifier");

        with_settings!({
            description => "Labeled arguments must have valid identifiers"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_labeled_argument_with_complex_value() {
        // Labeled argument with a nested function call
        let result = run_array(r#"["func", {":config": ["getConfig"]}]"#)
            .expect("should parse successfully");

        with_settings!({
            description => "Parses a labeled argument with a complex value"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_multiline_array() {
        // Multiline function call with formatting
        let result = run_array(
            r##"[
            "let",
            {"#literal": "x"},
            {"#literal": 10},
            ["add", {"#literal": "x"}, {"#literal": 5}]
            ]"##,
        )
        .expect("should parse successfully");

        with_settings!({
            description => "Parses a multiline function call with proper formatting"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_labeled_argument_complex_nested() {
        // A labeled argument with a nested labeled argument
        let result =
            run_array(r##"["func", {":config": ["setup", {":nested": {"#literal": true}}]}]"##)
                .expect("should parse successfully");

        with_settings!({
            description => "Parses a labeled argument containing nested labeled arguments"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_malformed_labeled_argument() {
        // Malformed labeled argument syntax with multiple keys
        let error = run_array(
            r##"["func", {":name": {"#literal": "value"}, "extra": {"#literal": true}}]"##,
        )
        .expect_err("should fail with multiple keys in a labeled argument object");

        with_settings!({
            description => "Malformed labeled argument with multiple keys should fail"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }
}
