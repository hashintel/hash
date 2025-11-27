//! Basic block representation for HashQL MIR.
//!
//! Basic blocks are the fundamental unit of control flow in the MIR. Each basic block
//! contains a sequence of statements followed by exactly one terminator that determines
//! where control flow continues.

use hashql_core::{heap, id, intern::Interned};

use super::{local::Local, statement::Statement, terminator::Terminator};

id::newtype!(
    /// A unique identifier for a basic block in the HashQL MIR.
    ///
    /// Basic blocks are identified by unique IDs that allow efficient referencing
    /// and manipulation within the control-flow graph. The ID space is carefully
    /// managed to support both dense allocation and niche optimizations.
    ///
    /// # Value Range
    ///
    /// The value space is restricted to `0..=0xFFFF_FF00`, reserving the last 256
    /// values for niche optimizations in `Option<BasicBlockId>` and similar types.
    pub struct BasicBlockId(u32 is 0..=0xFFFF_FF00)
);

impl BasicBlockId {
    pub const PLACEHOLDER: Self = Self(0xFFFF_FF00);
    pub const START: Self = Self(0);
}

id::newtype_collections!(pub type BasicBlock* from BasicBlockId);

/// A basic block in the HashQL MIR control-flow graph.
///
/// A basic block represents a straight-line sequence of code with exactly one entry point
/// (the beginning) and exactly one exit point (the terminator). This structure makes
/// control flow analysis and optimization much more tractable than working with
/// arbitrary control flow.
///
/// # Control Flow Invariants
///
/// - Control can only enter at the beginning of the block
/// - All statements execute in sequence without branching
/// - The terminator is the only way to exit the block
/// - The terminator determines all possible successor blocks
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct BasicBlock<'heap> {
    /// The parameters (input variables) for this basic block.
    ///
    /// These [`Local`] variables represent values that are passed into this block
    /// from predecessor blocks. They function similarly to function parameters
    /// but at the basic block level, enabling SSA-like properties in the MIR.
    pub params: Interned<'heap, [Local]>,

    /// The sequence of statements that execute within this basic block.
    ///
    /// These [`Statement`]s execute in order from first to last, with no possibility
    /// of branching or early exit until the terminator is reached. Each statement
    /// typically performs some computation or storage operation.
    pub statements: heap::Vec<'heap, Statement<'heap>>,

    /// The terminator that ends this basic block and determines control flow.
    ///
    /// Every basic block must end with exactly one [`Terminator`]. The terminator
    /// determines where execution continues after this block completes, whether
    /// that's jumping to another block, returning from the function, or other
    /// control flow operations.
    pub terminator: Terminator<'heap>,
}
