use alloc::borrow::Cow;

use hashql_ast::node::expr::{Expr, ListExpr};

use super::{ObjectState, State};
use crate::{ParserState, parser::error::ParserDiagnostic};

// The `#list` field is present
// but without `#type` present
pub(crate) struct ListNode<'heap> {
    expr: ListExpr<'heap>,
}

impl<'heap> State<'heap> for ListNode<'heap> {
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
