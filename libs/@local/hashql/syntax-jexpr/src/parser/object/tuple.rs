use alloc::borrow::Cow;

use hashql_ast::node::expr::{Expr, TupleExpr};

use super::{ObjectState, State};
use crate::{ParserState, parser::error::ParserDiagnostic};

// The `#tuple` field is present
// but without `#type` present
pub(crate) struct TupleNode<'heap> {
    expr: TupleExpr<'heap>,
}

impl<'heap> State<'heap> for TupleNode<'heap> {
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
