use alloc::borrow::Cow;

use hashql_ast::node::expr::Expr;

use super::{ObjectState, State};
use crate::{ParserState, parser::error::ParserDiagnostic};

pub(crate) struct Complete<'heap> {
    expr: Expr<'heap>,
    // key's that have been observed, useful for error reporting
    keys: &'static [&'static str],
}

impl<'heap> State<'heap> for Complete<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Cow<'_, str>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        todo!()
    }

    fn build(self, _: &mut ParserState<'heap, '_>) -> Result<Expr<'heap>, ParserDiagnostic> {
        Ok(self.expr)
    }
}
