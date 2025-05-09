use super::variable::Variable;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum NodeKind<'heap> {
    Call,

    // Data Structures
    Struct,
    Dict,
    Tuple,
    List,

    Literal,
    Variable(Variable<'heap>),
    Binding, // local binding
    Input,
    Closure,
    // If - currently unsupported

    // Indexing
    Field,
    Index,

    // Type Assertions
    Is, // Type Assertion (optimized out later after typechk)

    // These ones are new
    Constructor, // ctor for opaque values
    BinaryOperation,
    UnaryOperation,
    // TODO: graph operations
    Graph,
}
