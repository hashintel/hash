use hashql_core::{span::Spanned, symbol::Ident};

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
    Load { required: bool },

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

/// Represents an external input parameter for a query or function.
///
/// Input parameters define values that can be provided externally
/// to parameterize queries, with optional type constraints and default values.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct InputOperation<'heap> {
    pub op: Spanned<InputOp>,
    pub name: Ident<'heap>,
}
