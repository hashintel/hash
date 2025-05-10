use core::marker::PhantomData;

use hashql_core::span::SpanId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphKind {
    Never(!),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Graph<'heap> {
    pub span: SpanId,

    pub kind: GraphKind,

    _marker: PhantomData<&'heap ()>,
}
