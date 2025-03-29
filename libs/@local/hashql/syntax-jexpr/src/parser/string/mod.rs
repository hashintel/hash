mod combinator;
mod context;
mod error;
mod generic;
mod ident;
mod path;
#[cfg(test)]
pub(crate) mod test;
mod r#type;

use core::ops::Range;
use std::sync::Arc;

use hashql_ast::{
    heap::Heap,
    node::{
        expr::Expr,
        id::NodeId,
        path::{Path, PathSegment},
    },
};
use hashql_core::{
    span::{SpanId, storage::SpanStorage},
    symbol::Ident,
};
use text_size::{TextRange, TextSize};
use winnow::{
    BStr, LocatingSlice, ModalResult, Parser as _, Stateful,
    combinator::{alt, opt},
    error::ParserError,
    token::{one_of, take_while},
};

use self::{combinator::separated_boxed1, context::Input, error::StringDiagnostic};
use super::state::ParserState;

fn parse_string<'heap, 'source>(
    state: &mut ParserState<'heap, 'source>,
) -> Result<Expr<'heap>, StringDiagnostic> {
    todo!()
}
