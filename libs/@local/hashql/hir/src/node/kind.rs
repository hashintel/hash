use super::{access::Access, data::Data, variable::Variable};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum NodeKind<'heap> {
    Call,

    Variable(Variable<'heap>),
    Binding, // local binding
    Input,
    Closure,
    // If - currently unsupported
    Data(Data),
    Access(Access),

    // Type Assertions
    Is, // Type Assertion (optimized out later after typechk)

    // These ones are new
    Constructor, // ctor for opaque values
    BinaryOperation,
    UnaryOperation,
    // TODO: graph operations
    Graph,
}
