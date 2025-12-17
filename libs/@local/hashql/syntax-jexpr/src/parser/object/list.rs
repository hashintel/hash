use hashql_ast::node::{
    expr::{Expr, ExprKind, ListExpr, list::ListElement},
    id::NodeId,
};
use hashql_core::heap::CloneIn as _;
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::list_expected_array,
    r#type::{TypeNode, handle_typed},
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::syntax_kind::SyntaxKind,
    parser::{
        array::visit::visit_array, error::ParserDiagnostic, expr::parse_expr, state::Expected,
    },
};

pub(crate) struct ListNode<'heap> {
    key_span: TextRange,

    expr: ListExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> ListNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_list(state)?;

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

impl<'heap> State<'heap> for ListNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        handle_typed("#list", self.key_span, &mut self.r#type, state, &key)?;
        Ok(ObjectState::List(self))
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
            kind: ExprKind::List(self.expr),
        })
    }
}

fn parse_list<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
) -> Result<ListExpr<'heap>, ParserDiagnostic> {
    // We do not use the `expected` of advance here, so that we're able to give the user a better
    // error message.
    let token = state
        .advance(Expected::hint(SyntaxKind::LBracket))
        .change_category(From::from)?;

    if token.kind.syntax() != SyntaxKind::LBracket {
        return Err(
            list_expected_array(state.insert_range(token.span), token.kind.syntax())
                .map_category(From::from),
        );
    }

    let mut elements = Vec::new();

    let range = visit_array(state, token, |state| {
        let expr = parse_expr(state)?;

        let element = ListElement {
            id: NodeId::PLACEHOLDER,
            span: expr.span,
            value: Box::new_in(expr, state.heap()),
        };

        elements.push(element);

        Ok(())
    })?;

    Ok(ListExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(range),
        elements: elements.clone_in(state.heap()),
        r#type: None,
    })
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
    fn parse_empty_list() {
        // Empty list
        let result = parse_object_expr(r##"{"#list": []}"##).expect("should parse empty list");

        with_settings!({
            description => "Parses an empty list"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_tuple_incomplete() {
        // Empty tuple with object format
        let result =
            parse_object_expr(r##"{"#tuple": "##).expect_err("should not parse incomplete tuple");

        with_settings!({
            description => "Parses with a sudden EOF"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.diagnostic, &result.input);
        });
    }

    #[test]
    fn parse_list_with_literals() {
        // List with literal values
        let result = parse_object_expr(
            r##"{"#list": [{"#literal": 1}, {"#literal": 2}, {"#literal": 3}]}"##,
        )
        .expect("should parse list with literals");

        with_settings!({
            description => "Parses a list with literal values"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_list_with_mixed_types() {
        // List with mixed types of values
        let result = parse_object_expr(
            r##"{"#list": [
            {"#literal": "string"},
            {"#literal": 42},
            {"#literal": true}
        ]}"##,
        )
        .expect("should parse list with mixed types");

        with_settings!({
            description => "Parses a list with mixed types of values"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_list_with_nested_expressions() {
        // List with nested expressions
        let result = parse_object_expr(
            r##"{"#list": [
            ["add", {"#literal": 1}, {"#literal": 2}],
            {"#literal": "simple"},
            {"#dict": {"key": {"#literal": "value"}}}
        ]}"##,
        )
        .expect("should parse list with nested expressions");

        with_settings!({
            description => "Parses a list with nested expressions"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_list_with_type() {
        // List with type annotation
        let result = parse_object_expr(
            r##"{"#list": [{"#literal": 1}, {"#literal": 2}], "#type": "List<Int>"}"##,
        )
        .expect("should parse list with type");

        with_settings!({
            description => "Parses a list with type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_list_with_complex_type() {
        // List with complex type
        let result =
            parse_object_expr(r##"{"#list": [], "#type": "(element: String, max: Int)"}"##)
                .expect("should parse list with complex type");

        with_settings!({
            description => "Parses a list with a complex type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_invalid_list_value() {
        // Invalid value for list (not an array)
        let error = parse_object_expr(r##"{"#list": {"not": "an-array"}}"##)
            .expect_err("should fail with invalid list value");

        with_settings!({
            description => "Rejects non-array values for lists"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_duplicate_list_key() {
        // Duplicate #list keys
        let error = parse_object_expr(r##"{"#list": [], "#list": []}"##)
            .expect_err("should fail with duplicate #list key");

        with_settings!({
            description => "Rejects duplicate #list keys"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_duplicate_type_key() {
        // Duplicate #type keys
        let error =
            parse_object_expr(r##"{"#list": [], "#type": "List<Int>", "#type": "List<String>"}"##)
                .expect_err("should fail with duplicate #type key");

        with_settings!({
            description => "Rejects duplicate #type keys in list"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_unknown_key_in_list() {
        // Unknown key in list object
        let error = parse_object_expr(r##"{"#list": [], "unknown": {"#literal": "value"}}"##)
            .expect_err("should fail with unknown key");

        with_settings!({
            description => "Rejects unknown keys in list objects"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_nested_lists() {
        // Nested lists
        let result = parse_object_expr(
            r##"{"#list": [
            {"#list": [{"#literal": 1}, {"#literal": 2}]},
            {"#list": [{"#literal": 3}, {"#literal": 4}]}
        ]}"##,
        )
        .expect("should parse nested lists");

        with_settings!({
            description => "Parses nested lists"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_deeply_nested_list() {
        // Deeply nested list structure
        let result = parse_object_expr(
            r##"{"#list": [
            {"#list": [
                {"#list": [{"#literal": "deep"}]}
            ]}
        ]}"##,
        )
        .expect("should parse deeply nested list");

        with_settings!({
            description => "Parses a deeply nested list structure"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }
}
