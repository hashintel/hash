mod call;
mod goto;
mod graph;

pub use call::Call;
pub use goto::Goto;
use hashql_core::span::SpanId;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Terminator<'heap> {
    pub span: SpanId,

    pub kind: TerminatorKind<'heap>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TerminatorKind<'heap> {
    Goto(Goto),
    Call(Call<'heap>),
    Return,
    Unreachable,
}
