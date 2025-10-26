use super::{
    access::Access, branch::Branch, call::Call, closure::Closure, data::Data, graph::Graph,
    input::Input, r#let::Let, operation::Operation, thunk::Thunk, variable::Variable,
};

/// The different kinds of nodes available in the HashQL High-Level Intermediate Representation.
///
/// This enum defines all the various node types that can appear in the HIR of a HashQL program.
/// While the AST closely mirrors the syntax of the source code, the HIR represents a more
/// semantically meaningful structure after resolving special forms, desugaring, and normalization.
///
/// The node kinds are organized into logical categories:
/// - Data nodes represent literal values and structured data
/// - Variable and binding nodes handle named values and scoping
/// - Operation nodes represent computations and type operations
/// - Control flow nodes manage execution paths and closures
/// - High-level nodes represent domain-specific constructs like graph operations
///
/// Each variant contains a specific node structure that provides the detailed
/// representation of that construct in the HIR.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum NodeKind<'heap> {
    // Basic values and data
    /// Represents concrete data values such as literals, collections, and structured data.
    ///
    /// Data nodes include literals (integers, strings, booleans), collections (lists),
    /// and structured data types (structs, dictionaries, tuples).
    Data(Data<'heap>),

    // Variables and binding constructs
    /// Represents references to named values.
    ///
    /// Variables refer to values defined elsewhere, either locally in the current
    /// scope or through qualified paths to items in other modules.
    Variable(Variable<'heap>),

    /// Represents a lexically scoped variable binding.
    ///
    /// Let expressions bind a value to a name within a body expression,
    /// creating a new variable accessible only within that scope.
    Let(Let<'heap>),

    /// Represents an external input parameter for a query or function.
    ///
    /// Input parameters define values that can be provided externally
    /// to parameterize queries, with optional type constraints and default values.
    Input(Input<'heap>),

    // Operations and access
    /// Represents a computational operation on one or more values.
    ///
    /// Operations include arithmetic, comparison, and logical operations,
    /// as well as type operations like assertions and constructors.
    Operation(Operation<'heap>),

    /// Represents access to a component of a compound data structure.
    ///
    /// Access operations retrieve fields from structs or elements from
    /// collections using field names or indices.
    Access(Access<'heap>),

    /// Represents a function invocation with arguments.
    ///
    /// Call expressions invoke a function with positional arguments.
    /// The function can be any expression that evaluates to a callable value.
    Call(Call<'heap>),

    // Control flow
    /// Represents a conditional execution path.
    ///
    /// Branch expressions determine which of multiple expressions to
    /// evaluate based on test conditions, such as if/else expressions.
    Branch(Branch<'heap>),

    /// Represents an anonymous function definition.
    ///
    /// Closures define reusable function values with parameters, a body expression,
    /// and the ability to capture variables from the surrounding scope.
    Closure(Closure<'heap>),

    /// Represents a module-level delayed computation providing uniform module interface.
    ///
    /// Thunks themselves are only present at the top-level of a module and do not (unlike closures)
    /// capture variables from the surrounding scope.
    Thunk(Thunk<'heap>),

    // High-level structures
    /// Represents operations specific to graph querying and manipulation.
    ///
    /// Graph operations provide specialized functionality for interacting
    /// with the underlying graph database, including traversals and queries.
    Graph(Graph<'heap>),
}
