mod combinator;
mod context;
mod error;
mod generic;
mod ident;
mod path;
#[cfg(test)]
pub(crate) mod test;
mod r#type;

use hashql_ast::node::expr::Expr;

use self::error::StringDiagnostic;
use super::state::ParserState;

fn parse_string<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
) -> Result<Expr<'heap>, StringDiagnostic> {
    todo!()
}
