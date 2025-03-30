use alloc::borrow::Cow;

use hashql_ast::node::expr::{Expr, StructExpr};

use super::{ObjectState, State};
use crate::{ParserState, parser::error::ParserDiagnostic};

// The `#struct` field is present
// but without `#type` present
pub(crate) struct StructNode<'heap> {
    expr: StructExpr<'heap>,
}

impl<'heap> State<'heap> for StructNode<'heap> {
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
