use hashql_core::{heap::Heap, id};

use crate::body::operand::Operand;

id::newtype!(
    /// Index for function arguments in an [`Apply`] operation.
    ///
    /// The value space is restricted to 0..=0xFFFF_FF00, reserving the last 256 for niches.
    /// As real pattern types are an experimental feature in Rust, these can currently only be
    /// used by directly modifying and accessing the `NodeId`'s internal value.
    ///
    /// Arguments are indexed starting from 0, where index 0 refers to the first argument
    /// passed to the function.
    pub struct ArgIndex(u32 is 0..=0xFFFF_FF00)
);

id::newtype_collections!(pub type Arg* from ArgIndex);

/// Function application r-value.
///
/// An [`Apply`] represents a function call operation in the MIR, containing both
/// the function to be called and the arguments to pass to it. This is used for
/// all kinds of function invocations, including:
///
/// - User-defined function calls
/// - Built-in intrinsic operations
/// - Method calls on objects
/// - Type constructor invocations
///
/// # Structure
///
/// The function application consists of two main components:
/// - **Function**: The [`Operand`] that evaluates to the callable function
/// - **Arguments**: An ordered collection of [`Operand`]s representing the arguments
///
/// # Execution Semantics
///
/// During execution, the function operand is evaluated first to obtain the callable,
/// then each argument operand is evaluated in order, and finally the function is
/// invoked with the computed argument values.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Apply<'heap> {
    /// The function or callable to be invoked.
    ///
    /// This [`Operand`] must evaluate to a callable value such as a function,
    /// closure, or built-in operation. The operand can reference either a
    /// constant function (for direct function calls) or a computed value
    /// (for higher-order function scenarios).
    pub function: Operand<'heap>,

    /// The arguments to pass to the function.
    ///
    /// This [`ArgVec`] contains the ordered list of argument [`Operand`]s that
    /// will be evaluated and passed to the function.
    ///
    /// The number and types of arguments must match the function's signature,
    /// though this compatibility is typically verified during earlier compilation
    /// phases rather than at the MIR level.
    pub arguments: ArgVec<Operand<'heap>, &'heap Heap>,
}
