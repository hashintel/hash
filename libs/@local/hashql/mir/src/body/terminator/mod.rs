mod call;
mod goto;
mod graph;
mod r#return;
mod target;

use hashql_core::span::SpanId;

pub use self::{
    call::Call,
    goto::Goto,
    graph::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
    r#return::Return,
    target::Target,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Terminator<'heap> {
    pub span: SpanId,

    pub kind: TerminatorKind<'heap>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TerminatorKind<'heap> {
    Goto(Goto<'heap>),
    Call(Call<'heap>),
    Return(Return<'heap>),
    GraphRead(GraphRead<'heap>),
    Unreachable,
}
