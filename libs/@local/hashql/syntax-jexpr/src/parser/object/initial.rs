use hashql_ast::node::expr::Expr;
use text_size::TextRange;

use super::{
    ObjectState, State,
    dict::DictNode,
    error::{empty, unknown_key},
    list::ListNode,
    r#struct::StructNode,
    tuple::TupleNode,
    r#type::TypeNode,
    visit::Key,
};
use crate::{
    ParserState,
    parser::{error::ParserDiagnostic, object::literal::LiteralNode},
};

pub(crate) struct Initial;

impl<'heap> State<'heap> for Initial {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        match &*key.value {
            "#literal" => LiteralNode::parse(state, &key).map(ObjectState::Literal),
            "#struct" => StructNode::parse(state, &key).map(ObjectState::Struct),
            "#dict" => DictNode::parse(state, &key).map(ObjectState::Dict),
            "#tuple" => TupleNode::parse(state, &key).map(ObjectState::Tuple),
            "#list" => ListNode::parse(state, &key).map(ObjectState::List),
            "#type" => TypeNode::parse(state, &key).map(ObjectState::Type),
            _ => Err(unknown_key(
                state.insert_range(key.span),
                &key.value,
                &["#literal", "#struct", "#dict", "#tuple", "#list", "#type"],
            )
            .map_category(From::from)),
        }
    }

    fn build(
        self,
        state: &mut ParserState<'heap, '_, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        Err(empty(state.insert_range(span)).map_category(From::from))
    }
}
