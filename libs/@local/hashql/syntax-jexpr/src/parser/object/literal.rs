use hashql_ast::node::{
    expr::{Expr, ExprKind, LiteralExpr},
    id::NodeId,
};
use hashql_core::value::{self, Primitive};
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::literal_expected_primitive,
    r#type::{TypeNode, handle_typed},
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{syntax_kind_set::SyntaxKindSet, token_kind::TokenKind},
    parser::{
        error::{ParserDiagnostic, ParserDiagnosticCategory},
        state::Expected,
    },
};

pub(crate) struct LiteralNode<'heap> {
    key_span: TextRange,

    expr: LiteralExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> LiteralNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_literal(state)?;

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

impl<'heap> State<'heap> for LiteralNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        handle_typed("#literal", self.key_span, &mut self.r#type, state, &key)?;
        Ok(ObjectState::Literal(self))
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
            kind: ExprKind::Literal(self.expr),
        })
    }
}

fn parse_literal<'heap>(
    state: &mut ParserState<'heap, '_, '_>,
) -> Result<LiteralExpr<'heap>, ParserDiagnostic> {
    // We do not use the `expected` of advance here, so that we're able to give the user a better
    // error message.
    let token = state
        .advance(Expected::hint(SyntaxKindSet::VALUE))
        .change_category(ParserDiagnosticCategory::Lexer)?;

    let span = state.insert_range(token.span);

    let kind = match token.kind {
        TokenKind::Null => Primitive::Null,
        TokenKind::Number(number) => {
            if number.has_dot() || number.has_exponent() {
                Primitive::Float(value::Float::new_unchecked(
                    state.intern_symbol(number.as_str()),
                ))
            } else {
                Primitive::Integer(value::Integer::new_unchecked(
                    state.intern_symbol(number.as_str()),
                ))
            }
        }
        TokenKind::Bool(value) => Primitive::Boolean(value),
        TokenKind::String(value) => {
            Primitive::String(value::String::new(state.intern_symbol(value)))
        }
        kind @ (TokenKind::LBrace
        | TokenKind::RBrace
        | TokenKind::LBracket
        | TokenKind::RBracket
        | TokenKind::Colon
        | TokenKind::Comma) => {
            return Err(literal_expected_primitive(span, kind.syntax()).map_category(From::from));
        }
    };

    Ok(LiteralExpr {
        id: NodeId::PLACEHOLDER,
        span,
        kind,
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
    fn parse_simple_literal() {
        // Basic string literal
        let result = parse_object_expr(r##"{"#literal": "hello"}"##)
            .expect("should parse simple string literal");

        with_settings!({
            description => "Parses a simple string literal"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_incomplete() {
        let result = parse_object_expr(r##"{"#literal": "##)
            .expect_err("should not parse incomplete literal");

        with_settings!({
            description => "Parses with a sudden EOF"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.diagnostic, &result.input);
        });
    }

    #[test]
    fn parse_number_literals() {
        // Integer literal
        let result =
            parse_object_expr(r##"{"#literal": 42}"##).expect("should parse integer literal");

        with_settings!({
            description => "Parses an integer literal"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });

        // Float literal
        let result =
            parse_object_expr(r##"{"#literal": 3.14}"##).expect("should parse float literal");

        with_settings!({
            description => "Parses a float literal"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_boolean_literals() {
        // True literal
        let result =
            parse_object_expr(r##"{"#literal": true}"##).expect("should parse true literal");

        with_settings!({
            description => "Parses a boolean true literal"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });

        // False literal
        let result =
            parse_object_expr(r##"{"#literal": false}"##).expect("should parse false literal");

        with_settings!({
            description => "Parses a boolean false literal"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_null_literal() {
        // Null literal
        let result =
            parse_object_expr(r##"{"#literal": null}"##).expect("should parse null literal");

        with_settings!({
            description => "Parses a null literal"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_literal_with_type() {
        // Literal with type annotation
        let result = parse_object_expr(r##"{"#literal": 42, "#type": "Int"}"##)
            .expect("should parse literal with type");

        with_settings!({
            description => "Parses a literal with type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_invalid_literal() {
        // Using an object as literal value (should fail)
        let error = parse_object_expr(r##"{"#literal": {"invalid": "object"}}"##)
            .expect_err("should fail with invalid literal");

        with_settings!({
            description => "Rejects invalid literal values"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_literal_with_complex_type() {
        // Literal with a complex type annotation
        let result =
            parse_object_expr(r##"{"#literal": "example", "#type": "(name: String, age: Int)"}"##)
                .expect("should parse literal with complex type");

        with_settings!({
            description => "Parses a literal with a complex type annotation"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_duplicate_literal_key() {
        // Duplicate #literal keys
        let error = parse_object_expr(r##"{"#literal": 42, "#literal": 24}"##)
            .expect_err("should fail with duplicate #literal key");

        with_settings!({
            description => "Rejects duplicate #literal keys"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_duplicate_type_key() {
        // Duplicate #type keys
        let error = parse_object_expr(r##"{"#literal": 42, "#type": "Int", "#type": "Float"}"##)
            .expect_err("should fail with duplicate #type key");

        with_settings!({
            description => "Rejects duplicate #type keys"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_unknown_key_in_literal() {
        // Unknown key in literal object
        let error = parse_object_expr(r##"{"#literal": 42, "unknown": "value"}"##)
            .expect_err("should fail with unknown key");

        with_settings!({
            description => "Rejects unknown keys in literal objects"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_empty_object_as_literal() {
        // Empty object isn't a valid literal
        let error = parse_object_expr("{}").expect_err("should fail with empty object");

        with_settings!({
            description => "Rejects empty objects as literals"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }
}
