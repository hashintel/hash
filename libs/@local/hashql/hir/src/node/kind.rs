use super::variable::Variable;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum NodeKind<'heap> {
    Call,
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
    Field,
    Index,
    Is, // Type Assertion (optimized out later?)

    // These ones are new
    Constructor, // ctor for opaque values
    BinaryOperation,
    UnaryOperation,
}
