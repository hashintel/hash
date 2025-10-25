//! Branch terminator representation for HashQL MIR.
//!
//! Branch terminators represent conditional control flow operations that
//! evaluate a boolean condition and transfer control to one of two possible
//! target basic blocks based on the result.

use super::Target;
use crate::body::operand::Operand;

/// A conditional branch terminator in the HashQL MIR.
///
/// Branch terminators provide conditional control flow by evaluating a boolean
/// test operand and transferring control to one of two target basic blocks
/// based on the result. This is the fundamental building block for implementing
/// conditional statements, loops, and other control flow constructs.
///
/// # Control Flow Semantics
///
/// When executed, a branch terminator:
/// 1. Evaluates the test operand to obtain a boolean value
/// 2. If the result is `true`, transfers control to the `then` target
/// 3. If the result is `false`, transfers control to the `else` target
/// 4. Passes any specified arguments to the chosen target block
///
/// # Usage Patterns
///
/// Branch terminators are commonly used to implement:
/// - `if` statements and conditional expressions
/// - Loop conditions and early exits
/// - Pattern matching and guard clauses
/// - Boolean logic short-circuiting
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Branch<'heap> {
    /// The boolean test operand that determines which branch to take.
    ///
    /// This [`Operand`] is evaluated to obtain a boolean value. The result
    /// determines whether control transfers to the `then` target (if `true`)
    /// or the `else` target (if `false`). The operand may reference a boolean
    /// variable, constant, or the result of a boolean expression.
    pub test: Operand<'heap>,

    /// The target destination when the test evaluates to `true`.
    ///
    /// This [`Target`] specifies the basic block to transfer control to when
    /// the test condition is satisfied. It includes both the destination block
    /// and any arguments to pass to that block's parameters.
    pub then: Target<'heap>,

    /// The target destination when the test evaluates to `false`.
    ///
    /// This [`Target`] specifies the basic block to transfer control to when
    /// the test condition is not satisfied. It includes both the destination
    /// block and any arguments to pass to that block's parameters.
    pub r#else: Target<'heap>,
}
