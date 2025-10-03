use core::mem;

use hashql_ast::node::expr::Expr;
use text_size::TextRange;

use self::{
    dict::DictNode,
    initial::Initial,
    list::ListNode,
    literal::LiteralNode,
    r#struct::StructNode,
    tuple::TupleNode,
    r#type::TypeNode,
    visit::{Key, visit_object},
};
use super::error::ParserDiagnostic;
use crate::{ParserState, lexer::token::Token};

mod dict;
pub(crate) mod error;
mod initial;
mod list;
mod literal;
mod r#struct;
mod tuple;
mod r#type;
pub(crate) mod visit;

trait State<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic>;

    fn build(
        self,
        state: &mut ParserState<'heap, '_, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic>;
}

enum ObjectState<'heap> {
    // Nothing has been parsed yet
    Initial(Initial),

    Type(TypeNode<'heap>),
    Struct(StructNode<'heap>),
    Dict(DictNode<'heap>),
    List(ListNode<'heap>),
    Tuple(TupleNode<'heap>),
    Literal(LiteralNode<'heap>),
    // TODO: `Path` node
}

impl<'heap> State<'heap> for ObjectState<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_, '_>,
        key: Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        match self {
            Self::Initial(initial) => initial.handle(state, key),
            Self::Type(type_node) => type_node.handle(state, key),
            Self::Struct(struct_node) => struct_node.handle(state, key),
            Self::Dict(dict_node) => dict_node.handle(state, key),
            Self::List(list_node) => list_node.handle(state, key),
            Self::Tuple(tuple_node) => tuple_node.handle(state, key),
            Self::Literal(literal_node) => literal_node.handle(state, key),
        }
    }

    fn build(
        self,
        state: &mut ParserState<'heap, '_, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        match self {
            Self::Initial(initial) => initial.build(state, span),
            Self::Type(type_node) => type_node.build(state, span),
            Self::Struct(struct_node) => struct_node.build(state, span),
            Self::Dict(dict_node) => dict_node.build(state, span),
            Self::List(list_node) => list_node.build(state, span),
            Self::Tuple(tuple_node) => tuple_node.build(state, span),
            Self::Literal(literal_node) => literal_node.build(state, span),
        }
    }
}

pub(crate) fn parse_object<'heap, 'source>(
    state: &mut ParserState<'heap, 'source, '_>,
    token: Token<'source>,
) -> Result<Expr<'heap>, ParserDiagnostic> {
    let mut current = ObjectState::Initial(Initial);

    let range = visit_object(state, token, |state, key| {
        let scoped = mem::replace(&mut current, ObjectState::Initial(Initial));
        current = scoped.handle(state, key)?;

        Ok(())
    })?;

    let expr = current.build(state, range)?;

    Ok(expr)
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
    fn parse_empty_object() {
        // Empty object
        let error = parse_object_expr("{}").expect_err("should fail with empty object");

        with_settings!({
            description => "Rejects empty objects"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_unknown_top_level_key() {
        // Object with unknown top-level key
        let error = parse_object_expr(r#"{"invalid": 42}"#)
            .expect_err("should fail with unknown top-level key");

        with_settings!({
            description => "Rejects unknown top-level keys in objects"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_standalone_type() {
        // Object with only a #type key (should fail as type needs an associated expression)
        let error = parse_object_expr(r##"{"#type": "Int"}"##)
            .expect_err("should fail with standalone type");

        with_settings!({
            description => "Rejects standalone #type without an associated expression"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }

    #[test]
    fn parse_multiple_expression_keys() {
        // Object with multiple expression keys (should fail as only one is allowed)
        let error = parse_object_expr(r##"{"#literal": 42, "#list": []}"##)
            .expect_err("should fail with multiple expression keys");

        with_settings!({
            description => "Rejects objects with multiple expression keys"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error.diagnostic, &error.input);
        });
    }
}
