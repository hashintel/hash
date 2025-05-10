use core::marker::PhantomData;

use hashql_core::span::SpanId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum BranchKind {
    If(!),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Branch<'heap> {
    pub span: SpanId,

    pub kind: BranchKind,

    _marker: PhantomData<&'heap ()>,
}
