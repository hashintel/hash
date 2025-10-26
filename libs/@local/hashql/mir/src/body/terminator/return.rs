//! Return terminator representation for HashQL MIR.
//!
//! Return terminators represent the end of function execution and the transfer
//! of return values back to the calling context. They are the primary mechanism
//! for functions to complete and provide results to their callers.

use hashql_core::heap;

use crate::body::operand::Operand;

/// A return terminator in the HashQL MIR.
///
/// Return terminators represent the end of function execution and the transfer
/// of computed values back to the calling context. They are used to complete
/// function execution and provide results to callers.
///
/// # Return Value Semantics
///
/// Return terminators support multiple return values through a collection of
/// operands. This enables functions to return:
/// - Single values (most common case)
/// - Multiple values (tuple-like returns)
/// - No values (unit return type)
///
/// # Control Flow Effects
///
/// When executed, a return terminator issues an [`RValue::Load`] operation for every operand.
///
/// [`RValue::Load`]: crate::body::rvalue::RValue::Load
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Return<'heap> {
    /// The return values to provide to the calling context.
    ///
    /// This collection of [`Operand`]s specifies the values that will be
    /// returned to the caller when the function completes. The operands
    /// are evaluated and their results are packaged according to the
    /// function's declared return type.
    ///
    /// # Multiple Return Values
    ///
    /// - **Single value**: Most functions return one value
    /// - **Multiple values**: Functions can return tuple-like multiple values
    /// - **No values**: Empty collection represents unit/void return type
    pub value: Operand<'heap>,
}
