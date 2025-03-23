use hql_span::SpanId;

use super::r#type::Type;
use crate::{heap::P, node::ident::Ident};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Generic<'heap> {
    pub name: Ident,
    pub bound: Option<P<'heap, Type<'heap>>>,

    pub span: SpanId,
}
