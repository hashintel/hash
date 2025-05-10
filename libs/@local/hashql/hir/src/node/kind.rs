use super::{
    access::Access, branch::Branch, call::Call, closure::Closure, data::Data, graph::Graph,
    input::Input, r#let::Let, operation::Operation, variable::Variable,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum NodeKind<'heap> {
    // Basic values and data
    Data(Data<'heap>),

    // Variables and binding constructs
    Variable(Variable<'heap>),
    Let(Let<'heap>),
    Input(Input<'heap>),

    // Operations and access
    Operation(Operation<'heap>),
    Access(Access<'heap>),
    Call(Call<'heap>),

    // Control flow
    Branch(Branch<'heap>),
    Closure(Closure<'heap>),

    // High-level structures
    Graph(Graph<'heap>),
}
