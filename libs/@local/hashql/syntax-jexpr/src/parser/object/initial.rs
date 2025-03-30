use alloc::borrow::Cow;

use hashql_ast::node::expr::Expr;

use super::{ObjectState, State};
use crate::{ParserState, parser::error::ParserDiagnostic};

pub(crate) struct Initial;

impl<'heap> State<'heap> for Initial {
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
