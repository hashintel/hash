use super::{
    access::Access, branch::Branch, call::Call, closure::Closure, data::Data, graph::Graph,
    input::Input, r#let::Let, operation::Operation, variable::Variable,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum NodeKind<'heap> {
    Call(Call<'heap>),
    Variable(Variable<'heap>),
    Let(Let<'heap>),
    Input(Input<'heap>),
    Closure(Closure<'heap>),
    Branch(Branch<'heap>),
    Data(Data<'heap>),
    Access(Access<'heap>),
    Operation(Operation<'heap>),
    Graph(Graph<'heap>),
}
