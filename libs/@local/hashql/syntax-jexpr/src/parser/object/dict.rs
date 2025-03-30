use alloc::borrow::Cow;

use hashql_ast::node::expr::{DictExpr, Expr};

use super::{ObjectState, State};
use crate::{ParserState, parser::error::ParserDiagnostic};

// The `#dict` field is present
// but without `#type` present
pub(crate) struct DictNode<'heap> {
    expr: DictExpr<'heap>,
}

impl<'heap> State<'heap> for DictNode<'heap> {
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
