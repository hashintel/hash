use alloc::borrow::Cow;
use core::mem;

use hashql_ast::node::expr::Expr;

use self::{
    complete::Complete, dict::DictNode, initial::Initial, list::ListNode, r#struct::StructNode,
    tuple::TupleNode, r#type::TypeNode, visit::visit_object,
};
use super::error::ParserDiagnostic;
use crate::{ParserState, lexer::token::Token};

mod complete;
mod dict;
pub(crate) mod error;
mod initial;
mod list;
mod r#struct;
mod tuple;
mod r#type;
mod visit;

trait State<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Cow<'_, str>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic>;

    fn build(self, state: &mut ParserState<'heap, '_>) -> Result<Expr<'heap>, ParserDiagnostic>;
}

enum ObjectState<'heap> {
    // Nothing has been parsed yet
    Initial(Initial),

    Type(TypeNode<'heap>),
    Struct(StructNode<'heap>),
    Dict(DictNode<'heap>),
    List(ListNode<'heap>),
    Tuple(TupleNode<'heap>),

    // Parsing has been completed, any further fields will result in errors
    // `#literal` and `#path` will always immediately result in this
    Complete(Complete<'heap>),
}

impl<'heap> State<'heap> for ObjectState<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Cow<'_, str>,
    ) -> Result<Self, ParserDiagnostic> {
        match self {
            ObjectState::Initial(initial) => initial.handle(state, key),
            ObjectState::Type(type_node) => type_node.handle(state, key),
            ObjectState::Struct(struct_node) => struct_node.handle(state, key),
            ObjectState::Dict(dict_node) => dict_node.handle(state, key),
            ObjectState::List(list_node) => list_node.handle(state, key),
            ObjectState::Tuple(tuple_node) => tuple_node.handle(state, key),
            ObjectState::Complete(complete) => complete.handle(state, key),
        }
    }

    fn build(self, state: &mut ParserState<'heap, '_>) -> Result<Expr<'heap>, ParserDiagnostic> {
        match self {
            ObjectState::Initial(initial) => initial.build(state),
            ObjectState::Type(type_node) => type_node.build(state),
            ObjectState::Struct(struct_node) => struct_node.build(state),
            ObjectState::Dict(dict_node) => dict_node.build(state),
            ObjectState::List(list_node) => list_node.build(state),
            ObjectState::Tuple(tuple_node) => tuple_node.build(state),
            ObjectState::Complete(complete) => complete.build(state),
        }
    }
}

pub(crate) fn parse_object<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
    token: Token<'source>,
) -> Result<Expr<'heap>, ParserDiagnostic> {
    let mut current = ObjectState::Initial(Initial);

    let span = visit_object(state, token, |state, key| {
        let scoped = mem::replace(&mut current, ObjectState::Initial(Initial));
        current = scoped.handle(state, key)?;

        Ok(())
    })?;

    let mut expr = current.build(state)?;
    expr.span = state.insert_range(span);

    Ok(expr)
}
