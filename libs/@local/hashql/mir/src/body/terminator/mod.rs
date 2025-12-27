//! Terminator representation for HashQL MIR.
//!
//! Terminators represent the control flow operations that end basic blocks and
//! determine where execution continues. Unlike statements, terminators can affect
//! control flow by jumping to other blocks, calling functions, or ending execution.

mod goto;
mod graph;
mod r#return;
mod switch_int;
mod target;

use core::iter;

use hashql_core::span::SpanId;

pub use self::{
    goto::Goto,
    graph::{GraphRead, GraphReadBody, GraphReadHead, GraphReadLocation, GraphReadTail},
    r#return::Return,
    switch_int::{SwitchIf, SwitchInt, SwitchIntValue, SwitchTargets},
    target::Target,
};
use super::basic_block::BasicBlockId;

macro_rules! for_both {
    ($value:ident; $name:ident => $expr:expr) => {
        match $value {
            EitherIter::Left($name) => $expr,
            EitherIter::Right($name) => $expr,
        }
    };
}

// We could also contemplate implementing more API surface of iterator, but this should be
// sufficient for now
enum EitherIter<L, R> {
    Left(L),
    Right(R),
}

impl<L, R> Iterator for EitherIter<L, R>
where
    L: Iterator,
    R: Iterator<Item = L::Item>,
{
    type Item = L::Item;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        for_both!(self; value => value.next())
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        for_both!(self; value => value.size_hint())
    }
}

impl<L, R> DoubleEndedIterator for EitherIter<L, R>
where
    L: DoubleEndedIterator,
    R: DoubleEndedIterator<Item = L::Item>,
{
    #[inline]
    fn next_back(&mut self) -> Option<Self::Item> {
        for_both!(self; value => value.next_back())
    }
}

impl<L, R> ExactSizeIterator for EitherIter<L, R>
where
    L: ExactSizeIterator,
    R: ExactSizeIterator<Item = L::Item>,
{
    #[inline]
    fn len(&self) -> usize {
        for_both!(self; value => value.len())
    }
}

/// A terminator in the HashQL MIR.
///
/// Terminators represent control flow operations that end basic blocks and
/// determine where execution continues next. Every basic block must end with
/// exactly one terminator, which specifies all possible successor blocks
/// or execution endpoints.
///
/// # Control Flow Semantics
///
/// Terminators are the only way to:
/// - Transfer control between basic blocks
/// - Call functions and handle returns
/// - End execution of the current function
/// - Perform graph operations with control flow implications
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Terminator<'heap> {
    /// The source location span for this terminator.
    ///
    /// This [`SpanId`] tracks where in the original source code this terminator
    /// originated from, enabling accurate error reporting and debugging information
    /// for control flow operations.
    pub span: SpanId,

    /// The specific kind of control flow operation this terminator performs.
    ///
    /// The [`TerminatorKind`] determines what control flow action this terminator
    /// takes when executed, such as jumping to another block, calling a function,
    /// or ending execution.
    pub kind: TerminatorKind<'heap>,
}

impl Terminator<'_> {
    /// Creates an unreachable terminator at the given source location.
    ///
    /// Unreachable terminators indicate that control flow should never reach this point.
    /// Useful as a placeholder during MIR construction or for marking provably dead code.
    #[must_use]
    pub const fn unreachable(span: SpanId) -> Self {
        Self {
            span,
            kind: TerminatorKind::Unreachable,
        }
    }
}

/// The specific kind of control flow operation performed by a terminator.
///
/// Terminator kinds represent the different types of control flow operations
/// that can end a basic block. Each variant corresponds to a different way
/// of transferring control or ending execution.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TerminatorKind<'heap> {
    /// Unconditional jump to another basic block.
    ///
    /// This terminator kind transfers control directly to a target basic block
    /// without any conditions or side effects.
    Goto(Goto<'heap>),

    /// Conditional branch based on a boolean test.
    ///
    /// This terminator kind evaluates a boolean condition and transfers control
    /// to one of two target basic blocks based on the result.
    SwitchInt(SwitchInt<'heap>),

    /// Return from the current function.
    ///
    /// This terminator kind ends execution of the current function and returns
    /// control to the caller.
    Return(Return<'heap>),

    /// Graph database read operation.
    ///
    /// This terminator kind performs a graph database read operation that has
    /// control flow implications, such as conditional execution based on query
    /// results.
    GraphRead(GraphRead<'heap>),

    /// Unreachable code marker.
    ///
    /// This terminator kind indicates that execution should never reach this
    /// point in the code. It is used for optimization and verification purposes,
    /// and reaching it at runtime typically indicates a bug or invalid state.
    Unreachable,
}

impl<'heap> TerminatorKind<'heap> {
    /// Returns an iterator over the basic block IDs of all possible successors.
    ///
    /// The returned iterator yields the [`BasicBlockId`] of each block that control
    /// flow could transfer to from this terminator. For terminators with no successors
    /// (such as [`Return`] or [`Unreachable`](Self::Unreachable)), the iterator is empty.
    #[must_use]
    pub fn successor_blocks(
        &self,
    ) -> impl DoubleEndedIterator<Item = BasicBlockId> + ExactSizeIterator {
        match self {
            Self::Goto(goto) => EitherIter::Left(iter::once(goto.target.block)),
            Self::SwitchInt(switch) => EitherIter::Right(EitherIter::Left(
                switch.targets.targets().iter().map(|target| target.block),
            )),
            Self::GraphRead(read) => EitherIter::Left(iter::once(read.target)),
            Self::Return(_) | Self::Unreachable => {
                EitherIter::Right(EitherIter::Right(iter::empty()))
            }
        }
    }

    /// Returns an iterator over mutable references to successor basic block IDs.
    ///
    /// This allows rewriting the control flow targets of this terminator, such as
    /// during block renumbering or CFG transformations.
    pub fn successor_blocks_mut(
        &mut self,
    ) -> impl DoubleEndedIterator<Item = &mut BasicBlockId> + ExactSizeIterator {
        match self {
            Self::Goto(goto) => EitherIter::Left(iter::once(&mut goto.target.block)),
            Self::SwitchInt(switch) => EitherIter::Right(EitherIter::Left(
                switch
                    .targets
                    .targets_mut()
                    .iter_mut()
                    .map(|target| &mut target.block),
            )),
            Self::GraphRead(read) => EitherIter::Left(iter::once(&mut read.target)),
            Self::Return(_) | Self::Unreachable => {
                EitherIter::Right(EitherIter::Right(iter::empty()))
            }
        }
    }

    /// Returns a slice of all successor [`Target`]s.
    ///
    /// Unlike [`successor_blocks`](Self::successor_blocks), this returns the full [`Target`]
    /// including any arguments passed to the successor block. Returns an empty slice for
    /// terminators without targets ([`Return`], [`GraphRead`], [`Unreachable`](Self::Unreachable)).
    ///
    /// Note that [`GraphRead`] returns an empty slice because it injects its own target
    /// rather than using the standard target mechanism.
    #[must_use]
    pub fn successor_targets(&self) -> &[Target<'heap>] {
        match self {
            Self::Goto(goto) => core::slice::from_ref(&goto.target),
            Self::SwitchInt(switch) => switch.targets.targets(),
            // There is no successor target for `GraphRead`, as `GraphRead` injects its own target
            Self::Return(_) | Self::GraphRead(_) | Self::Unreachable => &[],
        }
    }

    /// Returns a mutable slice of all successor [`Target`]s, if any exist.
    ///
    /// Returns [`Some`] with a mutable slice for terminators that have modifiable targets
    /// ([`Goto`], [`SwitchInt`]), or [`None`] for terminators without modifiable targets
    /// ([`Return`], [`GraphRead`], [`Unreachable`](Self::Unreachable)).
    pub fn successor_targets_mut(&mut self) -> Option<&mut [Target<'heap>]> {
        match self {
            Self::Goto(goto) => Some(core::slice::from_mut(&mut goto.target)),
            Self::SwitchInt(switch) => Some(switch.targets.targets_mut()),
            // There is no successor target for `GraphRead`, as `GraphRead` injects its own target
            Self::Return(_) | Self::GraphRead(_) | Self::Unreachable => None,
        }
    }
}
