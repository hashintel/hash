//! Call terminator representation for HashQL MIR.
//!
//! Call terminators represent function invocations with control flow implications.
//! They handle both the function call operation and the subsequent return of
//! control to a designated continuation basic block.

use hashql_core::heap;

use super::Target;
use crate::body::{operand::Operand, place::Place};

/// A function call terminator in the HashQL MIR.
///
/// Call terminators represent function invocations that have control flow
/// implications. Unlike simple expressions, calls in terminator position
/// can affect control flow by potentially not returning (in case of exceptions
/// or divergence) or by transferring control to a continuation block after
/// the call completes.
///
/// # Call Semantics
///
/// When executed, a call terminator:
/// 1. Evaluates the function operand to determine the target function
/// 2. Evaluates all argument operands to prepare the call parameters
/// 3. Invokes the target function with the provided arguments
/// 4. Upon successful return, transfers control to the target basic block
/// 5. The return values become available for use in the target block
///
/// # Control Flow Implications
///
/// Call terminators can affect control flow in several ways:
/// - **Normal Return**: Control transfers to the target block with return values
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Call<'heap> {
    /// The function to be called.
    ///
    /// This [`Operand`] specifies the function that will be invoked. It may
    /// be a function pointer constant, a function loaded from a variable,
    /// or any other operand that evaluates to a callable function value.
    pub func: Operand<'heap>,

    /// The arguments to pass to the function.
    ///
    /// This collection of [`Operand`]s provides the arguments that will be
    /// passed to the called function. The operands are evaluated in order
    /// and their results are passed as the function's parameters.
    pub args: heap::Box<'heap, [Operand<'heap>]>,

    /// The continuation basic block to transfer control to after the call.
    ///
    /// This [`BasicBlockId`] specifies where control should transfer after
    /// the function call completes successfully. The called function's
    /// return values will be made available to this target block.
    pub target: Target<'heap>,

    /// Where the returned values will be stored.
    pub destination: Place<'heap>,
}
