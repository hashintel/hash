//! Reference renaming for inlined code.
//!
//! When inlining a callee into a caller, all references in the callee's code must be
//! adjusted to account for:
//!
//! - **Local offset**: The callee's locals are appended after the caller's locals.
//! - **Basic block offset**: The callee's blocks are appended after the caller's blocks.
//! - **Return transformation**: The callee's `Return` terminators become `Goto` to the continuation
//!   block, passing the return value as a block argument.
//!
//! [`RenameVisitor`] performs these transformations on the inlined code.

use core::convert::Infallible;

use hashql_core::id::Id as _;

use crate::{
    body::{
        basic_block::BasicBlockId,
        local::Local,
        location::Location,
        place::PlaceContext,
        terminator::{Goto, Return, Target, Terminator, TerminatorKind},
    },
    intern::Interner,
    visit::{self, VisitorMut, r#mut::filter},
};

/// Visitor that renames references in inlined code.
///
/// After copying a callee's basic blocks and locals into a caller, this visitor
/// adjusts all references so they point to the correct locations in the combined body.
pub(crate) struct RenameVisitor<'env, 'heap> {
    /// Offset to add to all local indices.
    ///
    /// The callee's `Local(0)` becomes `Local(local_offset)` in the caller.
    pub local_offset: usize,
    /// Offset to add to all basic block indices.
    ///
    /// The callee's `BasicBlockId(0)` becomes `BasicBlockId(bb_offset)` in the caller.
    pub bb_offset: usize,
    /// The continuation block to jump to instead of returning.
    ///
    /// When the callee would return, we instead jump to this block, passing
    /// the return value as a block argument.
    pub continuation: BasicBlockId,
    /// Interner for creating new interned slices (e.g., block arguments).
    pub interner: &'env Interner<'heap>,
}

impl<'heap> VisitorMut<'heap> for RenameVisitor<'_, 'heap> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    /// Rename a local reference by adding the local offset.
    fn visit_local(&mut self, _: Location, _: PlaceContext, local: &mut Local) -> Self::Result<()> {
        local.increment_by(self.local_offset);
        Ok(())
    }

    /// Rename a basic block reference by adding the block offset.
    fn visit_basic_block_id(
        &mut self,
        _: Location,
        basic_block_id: &mut BasicBlockId,
    ) -> Self::Result<()> {
        basic_block_id.increment_by(self.bb_offset);
        Ok(())
    }

    /// Transform terminators, converting `Return` to `Goto` continuation.
    ///
    /// First walks the terminator to rename any nested references, then checks
    /// if it's a `Return` and converts it to a `Goto` to the continuation block.
    fn visit_terminator(
        &mut self,
        location: Location,
        terminator: &mut Terminator<'heap>,
    ) -> Self::Result<()> {
        Ok(()) = visit::r#mut::walk_terminator(self, location, terminator);

        if let TerminatorKind::Return(Return { value }) = terminator.kind {
            terminator.kind = TerminatorKind::Goto(Goto {
                target: Target {
                    block: self.continuation,
                    args: self.interner.operands.intern_slice(&[value]),
                },
            });
        }

        Ok(())
    }
}
