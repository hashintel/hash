use hashql_core::{span::SpanId, symbol::Ident};

use super::{id::NodeId, r#type::Type};
use crate::heap;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Generic<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub bound: Option<heap::Box<'heap, Type<'heap>>>,
}
