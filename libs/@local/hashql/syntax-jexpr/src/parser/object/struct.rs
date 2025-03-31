use hashql_ast::node::{
    expr::{Expr, ExprKind, StructExpr},
    id::NodeId,
};
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::{duplicate_key, unknown_key},
    r#type::TypeNode,
    visit::Key,
};
use crate::{ParserState, error::ResultExt as _, parser::error::ParserDiagnostic};

// The `#struct` field is present
// but maybe without the `#type` present
pub(crate) struct StructNode<'heap> {
    key_span: TextRange,

    expr: StructExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> State<'heap> for StructNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        match &*key.value {
            "#struct" => Err(duplicate_key(
                state.insert_range(self.key_span),
                state.insert_range(key.span),
                "#struct",
            )
            .map_category(From::from)),
            "#type" if self.r#type.is_some() => Err(duplicate_key(
                state.insert_range(self.key_span),
                state.insert_range(key.span),
                "#type",
            )
            .map_category(From::from)),
            "#type" => {
                let r#type = TypeNode::parse(state, &key).change_category(From::from)?;

                self.r#type = Some(r#type);
                Ok(ObjectState::Struct(self))
            }
            _ => Err(unknown_key(
                state.insert_range(key.span),
                &key.value,
                if self.r#type.is_some() {
                    &[]
                } else {
                    &["#type"]
                },
            )
            .map_category(From::from)),
        }
    }

    fn build(
        mut self,
        state: &mut ParserState<'heap, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        let r#type = self
            .r#type
            .map(TypeNode::into_inner)
            .map(|r#type| state.heap().boxed(r#type));

        self.expr.r#type = r#type;

        Ok(Expr {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(span),
            kind: ExprKind::Struct(self.expr),
        })
    }
}
