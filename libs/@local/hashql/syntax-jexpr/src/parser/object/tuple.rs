use alloc::borrow::Cow;

use hashql_ast::node::expr::{Expr, TupleExpr};
use text_size::TextRange;

use super::{ObjectState, State, visit::Key};
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
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        todo!()
    }

    fn build(
        self,
        state: &mut ParserState<'heap, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        todo!()
    }
}
