use hashql_ast::node::{
    expr::{Expr, ExprKind, TupleExpr, tuple::TupleElement},
    id::NodeId,
};
use hashql_core::heap::CollectIn as _;
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::tuple_expected_array,
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

pub(crate) struct TupleNode<'heap> {
    key_span: TextRange,

    expr: TupleExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> TupleNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_tuple(state)?;

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

impl<'heap> State<'heap> for TupleNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        handle_typed("#tuple", self.key_span, &mut self.r#type, state, &key)?;
        Ok(ObjectState::Tuple(self))
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
            kind: ExprKind::Tuple(self.expr),
        })
    }
}

fn parse_tuple<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
) -> Result<TupleExpr<'heap>, ParserDiagnostic> {
    // We do not use the `expected` of advance here, so that we're able to give the user a better
    // error message.
    let token = state
        .advance(Expected::hint(SyntaxKind::LBracket))
        .change_category(From::from)?;

    if token.kind.syntax() != SyntaxKind::LBracket {
        return Err(
            tuple_expected_array(state.insert_range(token.span), token.kind.syntax())
                .map_category(From::from),
        );
    }

    let mut elements = Vec::new();

    let range = visit_array(state, token, |state| {
        let expr = parse_expr(state)?;

        let element = TupleElement {
            id: NodeId::PLACEHOLDER,
            span: expr.span,
            value: Box::new_in(expr, state.heap()),
        };

        elements.push(element);

        Ok(())
    })?;

    Ok(TupleExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(range),
        elements: elements.into_iter().collect_in(state.heap()),
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
    fn parse_empty_tuple() {
        // Empty tuple
        let result = parse_object_expr(r##"{"#tuple": []}"##).expect("should parse empty tuple");

        with_settings!({
            description => "Parses an empty tuple"
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
    fn parse_tuple_with_literals() {
        // Tuple with literal values
        let result = parse_object_expr(
            r##"{"#tuple": [{"#literal": 1}, {"#literal": "text"}, {"#literal": true}]}"##,
        )
        .expect("should parse tuple with literals");

        with_settings!({
            description => "Parses a tuple with heterogeneous literal values"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_tuple_with_complex_elements() {
        // Tuple with complex elements
        let result = parse_object_expr(
            r##"{"#tuple": [
            ["add", {"#literal": 1}, {"#literal": 2}],
            {"#list": [{"#literal": "a"}, {"#literal": "b"}]},
            {"#dict": {"key": {"#literal": 42}}}
        ]}"##,
        )
        .expect("should parse tuple with complex elements");

        with_settings!({
            description => "Parses a tuple with complex nested elements"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_tuple_with_type() {
        // Tuple with type annotation
        let result = parse_object_expr(r##"{"#tuple": [{"#literal": 1}, {"#literal": "text"}], "#type": "Tuple<Int, String>"}"##)
            .expect("should parse tuple with type");

        with_settings!({
            description => "Parses a tuple with type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_tuple_with_complex_type() {
        // Tuple with complex type
        let result = parse_object_expr(
            r##"{"#tuple": [{"#literal": "key"}, {"#literal": 42}], "#type": "(first: String, second: Int)"}"##,
        )
        .expect("should parse tuple with complex type");

        with_settings!({
            description => "Parses a tuple with a complex type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_invalid_tuple_value() {
        // Invalid value for tuple (not an array)
        let error = parse_object_expr(r##"{"#tuple": {"not": "an-array"}}"##)
            .expect_err("should fail with invalid tuple value");

        with_settings!({
            description => "Rejects non-array values for tuples"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_duplicate_tuple_key() {
        // Duplicate #tuple keys
        let error = parse_object_expr(r##"{"#tuple": [], "#tuple": []}"##)
            .expect_err("should fail with duplicate #tuple key");

        with_settings!({
            description => "Rejects duplicate #tuple keys"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_duplicate_type_key() {
        // Duplicate #type keys
        let error = parse_object_expr(
            r##"{"#tuple": [], "#type": "Tuple<Int, String>", "#type": "Tuple<Float, Boolean>"}"##,
        )
        .expect_err("should fail with duplicate #type key");

        with_settings!({
            description => "Rejects duplicate #type keys in tuple"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_unknown_key_in_tuple() {
        // Unknown key in tuple object
        let error = parse_object_expr(r##"{"#tuple": [], "unknown": {"#literal": "value"}}"##)
            .expect_err("should fail with unknown key");

        with_settings!({
            description => "Rejects unknown keys in tuple objects"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_nested_tuples() {
        // Nested tuples
        let result = parse_object_expr(
            r##"{"#tuple": [
            {"#tuple": [{"#literal": 1}, {"#literal": "a"}]},
            {"#tuple": [{"#literal": true}, {"#literal": 3.14}]}
        ]}"##,
        )
        .expect("should parse nested tuples");

        with_settings!({
            description => "Parses nested tuples"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_tuple_with_single_element() {
        // Tuple with a single element
        let result = parse_object_expr(r##"{"#tuple": [{"#literal": "solo"}]}"##)
            .expect("should parse tuple with single element");

        with_settings!({
            description => "Parses a tuple with a single element"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_tuple_with_many_elements() {
        // Tuple with many elements to test scaling
        let result = parse_object_expr(
            r##"{"#tuple": [
            {"#literal": 1},
            {"#literal": 2},
            {"#literal": 3},
            {"#literal": 4},
            {"#literal": 5},
            {"#literal": 6},
            {"#literal": 7},
            {"#literal": 8},
            {"#literal": 9},
            {"#literal": 10}
        ]}"##,
        )
        .expect("should parse tuple with many elements");

        with_settings!({
            description => "Parses a tuple with many elements"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }
}
