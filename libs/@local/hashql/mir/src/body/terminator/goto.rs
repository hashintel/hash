//! Goto terminator representation for HashQL MIR.
//!
//! Goto terminators represent unconditional jumps to other basic blocks,
//! providing the fundamental mechanism for sequential control flow in the MIR.

use super::target::Target;

/// An unconditional jump terminator in the HashQL MIR.
///
/// Goto terminators represent unconditional control flow transfers to another
/// basic block. They are the simplest form of control flow operation, providing
/// direct jumps without conditions, function calls, or other side effects.
///
/// # Control Flow Semantics
///
/// When executed, a goto terminator yields back control to the target and calls [`RValue::Load`] on
/// any arguments passed to it to the arguments of the target basic block.
///
/// # Usage Patterns
///
/// Goto terminators are commonly used for:
/// - Sequential execution flow between basic blocks
/// - Loop back-edges that jump to loop headers
/// - Branch targets after conditional logic is resolved
/// - Fall-through cases in control flow structures
///
/// [`RValue::Load`]: crate::body::rvalue::RValue::Load
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Goto<'heap> {
    /// The target destination for the unconditional jump.
    ///
    /// This [`Target`] specifies both the destination basic block and any
    /// arguments that should be passed to that block's parameters when
    /// control transfers. The jump is unconditional and always transfers
    /// to this target.
    pub target: Target<'heap>,
}
