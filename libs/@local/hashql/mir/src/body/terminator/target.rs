//! Target representation for HashQL MIR terminators.
//!
//! Targets specify the destination of control flow transfers, including both
//! the target basic block and any arguments to pass to that block's parameters.

use hashql_core::intern::Interned;

use crate::body::{basic_block::BasicBlockId, operand::Operand};

/// A control flow target in the HashQL MIR.
///
/// Targets represent the destination of control flow transfers such as jumps,
/// calls, and conditional branches. They specify both where control should
/// transfer to and what arguments should be passed to the target block.
///
/// # Parameter Passing
///
/// When control transfers to the target block, the provided arguments are matched with the target
/// block's parameters. This enables a form of SSA (Static Single Assignment) representation where
/// values can be passed between basic blocks in a structured way.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Target<'heap> {
    /// The destination basic block for the control flow transfer.
    ///
    /// This [`BasicBlockId`] identifies which basic block control should
    /// transfer to when this target is used. The target block must exist
    /// within the same function body.
    pub block: BasicBlockId,

    /// The arguments to pass to the target block's parameters.
    ///
    /// This collection of [`Operand`]s provides the values that will be
    /// passed to the target block's parameters when control transfers.
    /// The number and types of arguments must match the target block's
    /// parameter specification.
    pub args: Interned<'heap, [Operand<'heap>]>,
}

impl Target<'_> {
    #[must_use]
    pub const fn block(block: BasicBlockId) -> Self {
        Self {
            block,
            args: Interned::empty(),
        }
    }
}
