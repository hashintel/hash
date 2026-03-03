//! Input operation representation for HashQL MIR.
//!
//! Input operations provide access to external input data or query parameters
//! that are provided at query execution time. They enable HashQL queries to
//! accept dynamic inputs and parameters from the calling context.

use hashql_core::symbol::Symbol;
use hashql_hir::node::operation::InputOp;

/// An input operation r-value in the HashQL MIR.
///
/// Input operations provide access to external input data or parameters
/// that are supplied at query execution time. They enable HashQL queries
/// to be parameterized and accept dynamic values from the calling context.
///
/// # Runtime Behavior
///
/// Input operations are resolved at query execution time by:
/// 1. Looking up the named parameter in the execution context
/// 2. Performing the specified operation (load value or check existence)
/// 3. Returning the result to the calling expression
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Input<'heap> {
    /// The type of input operation to perform.
    pub op: InputOp,

    /// The name of the input parameter to access.
    ///
    /// This [`Symbol`] identifies which input parameter to operate on.
    /// The name is used to look up the parameter in the query execution
    /// context at runtime.
    pub name: Symbol<'heap>,
}
