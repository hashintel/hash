use alloc::borrow::Cow;

use hashql_ast::node::expr::{Expr, TypeExpr};

use super::{ObjectState, State};
use crate::{ParserState, parser::error::ParserDiagnostic};

// The `#type` field is present
// but without `#struct`, `#dict`, `#list`, `#tuple` present
pub(crate) struct TypeNode<'heap> {
    expr: TypeExpr<'heap>,
}

impl<'heap> State<'heap> for TypeNode<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Cow<'_, str>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        todo!()
    }

    fn build(self, state: &mut ParserState<'heap, '_>) -> Result<Expr<'heap>, ParserDiagnostic> {
        todo!()
    }
}
