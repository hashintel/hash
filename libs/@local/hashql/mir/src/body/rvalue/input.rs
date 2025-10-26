//! Input operation representation for HashQL MIR.
//!
//! Input operations provide access to external input data or query parameters
//! that are provided at query execution time. They enable HashQL queries to
//! accept dynamic inputs and parameters from the calling context.

use hashql_core::symbol::Symbol;

/// The type of input operation to perform.
///
/// Input operations specify how to interact with external input data
/// identified by name. Different operations provide different ways to
/// access and check the availability of input parameters.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum InputOp {
    /// Load the value of an input parameter.
    ///
    /// This operation retrieves the actual value of the named input parameter
    /// from the query execution context. The parameter must exist and have a
    /// value, otherwise this operation may result in a runtime error.
    ///
    /// # Usage
    ///
    /// Commonly used to access:
    /// - Query parameters passed by the caller
    /// - Configuration values from the execution environment
    /// - Dynamic values that vary between query executions
    Load,

    /// Check whether an input parameter exists.
    ///
    /// This operation returns a boolean value indicating whether the named
    /// input parameter is available in the current execution context.
    /// It provides a way to conditionally handle optional parameters.
    ///
    /// # Usage
    ///
    /// Useful for:
    /// - Implementing optional query parameters
    /// - Providing default behavior when inputs are missing
    /// - Validating input availability before attempting to load
    Exists,
}

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
