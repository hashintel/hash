use hashql_ast::node::{
    expr::{DictExpr, Expr, ExprKind, LiteralExpr, dict::DictEntry},
    id::NodeId,
};
use hashql_core::{
    heap::CloneIn as _,
    value::{self, Primitive},
};
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::{
        dict_entry_expected_array, dict_entry_too_few_items, dict_entry_too_many_items,
        dict_expected_format,
    },
    r#type::{TypeNode, handle_typed},
    visit::{Key, visit_object},
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet, token::Token},
    parser::{
        array::visit::visit_array, error::ParserDiagnostic, expr::parse_expr, state::Expected,
    },
};

pub(crate) struct DictNode<'heap> {
    key_span: TextRange,

    expr: DictExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> DictNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_dict(state)?;

        Ok(Self {
            key_span: key.span,
            expr,
            r#type: None,
        })
    }

    pub(crate) fn with_type(mut self, r#type: TypeNode<'heap>) -> Self {
        self.r#type = Some(r#type);
        self
    }
}

impl<'heap> State<'heap> for DictNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        handle_typed("#dict", self.key_span, &mut self.r#type, state, &key)?;
        Ok(ObjectState::Dict(self))
    }

    fn build(
        mut self,
        state: &mut ParserState<'heap, '_, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        self.expr.r#type = TypeNode::finish(self.r#type, state);

        Ok(Expr {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(span),
            kind: ExprKind::Dict(self.expr),
        })
    }
}

fn parse_dict_object<'heap, 'source>(
    state: &mut ParserState<'heap, 'source, '_>,
    token: Token<'source>,
) -> Result<DictExpr<'heap>, ParserDiagnostic> {
    let mut entries = Vec::new();

    let span = visit_object(state, token, |state, key| {
        let key_span = key.span;

        let key_span_id = state.insert_range(key.span);
        let key = Expr {
            id: NodeId::PLACEHOLDER,
            span: key_span_id,
            kind: ExprKind::Literal(LiteralExpr {
                id: NodeId::PLACEHOLDER,
                span: key_span_id,
                kind: Primitive::String(value::String::new(state.intern_symbol(key.value))),
                r#type: None,
            }),
        };

        let value = parse_expr(state)?;
        let value_span = state.current_span();

        let entry_span = key_span.cover(value_span);

        entries.push(DictEntry {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(entry_span),
            key: Box::new_in(key, state.heap()),
            value: Box::new_in(value, state.heap()),
        });

        Ok(())
    })?;

    Ok(DictExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(span),
        entries: entries.clone_in(state.heap()),
        r#type: None,
    })
}

fn parse_dict_array<'heap, 'source>(
    state: &mut ParserState<'heap, 'source, '_>,
    token: Token<'source>,
) -> Result<DictExpr<'heap>, ParserDiagnostic> {
    let mut entries = Vec::new();

    let span = visit_array(state, token, |state| {
        let mut key = None;
        let mut value = None;
        let mut excess = Vec::new();

        // We're parsing everything here, so that we're able to improve the error message
        let token = state
            .advance(Expected::hint(SyntaxKind::LBracket))
            .change_category(From::from)?;

        if token.kind.syntax() != SyntaxKind::LBracket {
            return Err(dict_entry_expected_array(
                state.insert_range(token.span),
                token.kind.syntax(),
            )
            .map_category(From::from));
        }

        let span = visit_array(state, token, |state| {
            if key.is_some() && value.is_some() {
                // We just parse, and then report the issue later
                // This way we're able to tell the user how many entries were skipped
                let expr = parse_expr(state)?;
                excess.push(expr.span);

                return Ok(());
            }

            let expr = parse_expr(state)?;

            if key.is_none() {
                key = Some(expr);
            } else {
                value = Some(expr);
            }

            Ok(())
        })?;

        if !excess.is_empty() {
            return Err(dict_entry_too_many_items(&excess).map_category(From::from));
        }

        let found = usize::from(key.is_some()) + usize::from(value.is_some());
        let Some((key, value)) = Option::zip(key, value) else {
            return Err(
                dict_entry_too_few_items(state.insert_range(span), found).map_category(From::from)
            );
        };

        entries.push(DictEntry {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(span),
            key: Box::new_in(key, state.heap()),
            value: Box::new_in(value, state.heap()),
        });

        Ok(())
    })?;

    Ok(DictExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(span),
        entries: entries.clone_in(state.heap()),
        r#type: None,
    })
}

fn parse_dict<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
) -> Result<DictExpr<'heap>, ParserDiagnostic> {
    // We're parsing everything here, so that we're able to improve the error message
    let token = state
        .advance(Expected::hint(SyntaxKindSet::from_slice(&[
            SyntaxKind::LBrace,
            SyntaxKind::LBracket,
        ])))
        .change_category(From::from)?;

    let is_object = match token.kind.syntax() {
        SyntaxKind::LBrace => true,
        SyntaxKind::LBracket => false,
        kind @ (SyntaxKind::String
        | SyntaxKind::Number
        | SyntaxKind::True
        | SyntaxKind::False
        | SyntaxKind::Null
        | SyntaxKind::Comma
        | SyntaxKind::Colon
        | SyntaxKind::RBrace
        | SyntaxKind::RBracket) => {
            let span = state.insert_range(token.span);

            return Err(dict_expected_format(span, kind)).change_category(From::from)?;
        }
    };

    if is_object {
        parse_dict_object(state, token)
    } else {
        parse_dict_array(state, token)
    }
}

#[cfg(test)]
mod tests {
    use insta::{assert_snapshot, with_settings};

    use crate::{
        lexer::syntax_kind::SyntaxKind,
        parser::{object::parse_object, test::bind_parser},
    };

    // Create a parser binding that will handle objects starting with '{'
    bind_parser!(fn parse_object_expr(parse_object, SyntaxKind::LBrace));

    #[test]
    fn parse_empty_dict_object_format() {
        // Empty dict with object format
        let result = parse_object_expr(r##"{"#dict": {}}"##)
            .expect("should parse empty dict in object format");

        with_settings!({
            description => "Parses an empty dict using object format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_empty_dict_array_format() {
        // Empty dict with array format
        let result = parse_object_expr(r##"{"#dict": []}"##)
            .expect("should parse empty dict in array format");

        with_settings!({
            description => "Parses an empty dict using array format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_dict_incomplete() {
        // Empty dict with object format
        let result =
            parse_object_expr(r##"{"#dict": "##).expect_err("should not parse incomplete dict");

        with_settings!({
            description => "Parses with a sudden EOF"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.diagnostic, &result.input);
        });
    }

    #[test]
    fn parse_dict_object_format() {
        // Dict with entries in object format
        let result = parse_object_expr(
            r##"{"#dict": {
            "key1": {"#literal": "value1"},
            "key2": {"#literal": 42}
        }}"##,
        )
        .expect("should parse dict in object format");

        with_settings!({
            description => "Parses a dict with entries using object format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_dict_array_format() {
        // Dict with entries in array format
        let result = parse_object_expr(
            r##"{"#dict": [
            [{"#literal": "key1"}, {"#literal": "value1"}],
            [{"#literal": "key2"}, {"#literal": 42}]
        ]}"##,
        )
        .expect("should parse dict in array format");

        with_settings!({
            description => "Parses a dict with entries using array format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_dict_with_complex_values() {
        // Dict with complex values in object format
        let result = parse_object_expr(
            r##"{"#dict": {
            "simple": {"#literal": "value"},
            "nested": {"#struct": {"name": {"#literal": "Alice"}}},
            "list": {"#list": [{"#literal": 1}, {"#literal": 2}]},
            "function": ["add", {"#literal": 1}, {"#literal": 2}]
        }}"##,
        )
        .expect("should parse dict with complex values");

        with_settings!({
            description => "Parses a dict with complex values using object format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_dict_array_format_with_complex_values() {
        // Dict with complex values in array format
        let result = parse_object_expr(
            r##"{"#dict": [
            [{"#literal": "key1"}, {"#struct": {"name": {"#literal": "Bob"}}}],
            [{"#literal": "key2"}, {"#list": [{"#literal": 1}, {"#literal": 2}]}]
        ]}"##,
        )
        .expect("should parse dict with complex values in array format");

        with_settings!({
            description => "Parses a dict with complex values using array format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_dict_with_type() {
        // Dict with type annotation
        let result = parse_object_expr(
            r##"{"#dict": {
            "key": {"#literal": "value"}
            }, "#type": "Dict<String, String>"}"##,
        )
        .expect("should parse dict with type");

        with_settings!({
            description => "Parses a dict with type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_dict_with_complex_type() {
        // Dict with complex type annotation
        let result = parse_object_expr(
            r##"{"#dict": {
            "key": {"#literal": "value"}
        }, "#type": "Dict<String, `?`>"}"##,
        )
        .expect("should parse dict with complex type");

        with_settings!({
            description => "Parses a dict with complex type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_dict_array_format_with_too_few_items() {
        // Array format dict entry with too few items
        let error = parse_object_expr(
            r##"{"#dict": [
            [{"#literal": "key1"}]
        ]}"##,
        )
        .expect_err("should fail with too few items");

        with_settings!({
            description => "Rejects dict entry with too few items in array format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_dict_array_format_with_too_many_items() {
        // Array format dict entry with too many items
        let error = parse_object_expr(
            r##"{"#dict": [
            [{"#literal": "key1"}, {"#literal": "value1"}, {"#literal": "extra"}]
        ]}"##,
        )
        .expect_err("should fail with too many items");

        with_settings!({
            description => "Rejects dict entry with too many items in array format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_dict_invalid_array_entry() {
        // Array format with invalid entry (not an array)
        let error = parse_object_expr(
            r##"{"#dict": [
            {"not": "an-array"}
        ]}"##,
        )
        .expect_err("should fail with invalid array entry");

        with_settings!({
            description => "Rejects invalid entry format in array-format dict"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_invalid_dict_format() {
        // Invalid dict value (neither object nor array)
        let error = parse_object_expr(r##"{"#dict": "invalid"}"##)
            .expect_err("should fail with invalid dict format");

        with_settings!({
            description => "Rejects invalid dict format (not object or array)"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_duplicate_dict_key() {
        // Duplicate #dict keys
        let error = parse_object_expr(r##"{"#dict": {}, "#dict": {}}"##)
            .expect_err("should fail with duplicate #dict key");

        with_settings!({
            description => "Rejects duplicate #dict keys"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_duplicate_type_key() {
        // Duplicate #type keys
        let error = parse_object_expr(
            r##"{"#dict": {}, "#type": "Dict<String, Int>", "#type": "Dict<String, Boolean>"}"##,
        )
        .expect_err("should fail with duplicate #type key");

        with_settings!({
            description => "Rejects duplicate #type keys in dict"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_unknown_key_in_dict() {
        // Unknown key in dict object
        let error = parse_object_expr(r##"{"#dict": {}, "unknown": {"#literal": "value"}}"##)
            .expect_err("should fail with unknown key");

        with_settings!({
            description => "Rejects unknown keys in dict objects"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_dict_with_complex_keys() {
        // Dict with complex expressions as keys in array format
        let result = parse_object_expr(
            r##"{"#dict": [
            [["concat", {"#literal": "pre"}, {"#literal": "fix"}], {"#literal": "value"}],
            [{"#struct": {"keypart": {"#literal": "complex"}}}, {"#literal": "value2"}]
        ]}"##,
        )
        .expect("should parse dict with complex keys in array format");

        with_settings!({
            description => "Parses a dict with complex expressions as keys using array format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_nested_dicts() {
        // Nested dicts in object format
        let result = parse_object_expr(
            r##"{"#dict": {
            "outer1": {"#dict": {
                "inner1": {"#literal": "value1"},
                "inner2": {"#literal": "value2"}
            }},
            "outer2": {"#dict": {
                "inner3": {"#literal": "value3"}
            }}
        }}"##,
        )
        .expect("should parse nested dicts");

        with_settings!({
            description => "Parses nested dicts using object format"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }
}
