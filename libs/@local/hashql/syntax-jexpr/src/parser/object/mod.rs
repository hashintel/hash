use alloc::borrow::Cow;
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
mod visit;

trait State<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic>;

    fn build(
        self,
        state: &mut ParserState<'heap, '_>,
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
        state: &mut ParserState<'heap, '_>,
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
        state: &mut ParserState<'heap, '_>,
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
    state: &mut ParserState<'heap, 'source>,
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
