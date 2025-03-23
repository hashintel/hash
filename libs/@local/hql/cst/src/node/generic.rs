use hql_span::SpanId;
use hql_symbol::Ident;

use super::r#type::Type;
use crate::heap::P;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Generic<'heap> {
    pub name: Ident,
    pub bound: Option<P<'heap, Type<'heap>>>,

    pub span: SpanId,
}
