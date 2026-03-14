//! Suspension and continuation types for interpreter yield points.
//!
//! When the interpreter encounters an operation that requires external data
//! (such as a graph database query), it suspends execution and yields a
//! [`Suspension`] describing what it needs. The caller fulfills the request
//! and constructs a [`Continuation`] to resume interpretation.
//!
//! # Protocol
//!
//! 1. [`Runtime::start`] or [`Runtime::resume`] returns [`Yield::Suspension`]
//! 2. The caller inspects the [`Suspension`] variant to determine what is needed
//! 3. The caller fulfills the request and calls [`GraphReadSuspension::resolve`] to produce a
//!    [`Continuation`]
//! 4. The caller passes the [`Continuation`] to [`Runtime::resume`]
//!
//! [`Runtime::start`]: super::runtime::Runtime::start
//! [`Runtime::resume`]: super::runtime::Runtime::resume
//! [`Yield::Suspension`]: super::runtime::Yield::Suspension

mod graph_read;
mod temporal;

use core::{alloc::Allocator, debug_assert_matches};

pub(crate) use self::graph_read::extract_axis;
pub use self::temporal::{TemporalAxesInterval, TemporalInterval, Timestamp};
use super::{CallStack, RuntimeError, value::Value};
use crate::{
    body::{basic_block::BasicBlockId, terminator::GraphRead},
    def::DefId,
    interpret::runtime::CurrentBlock,
};

/// A request for external data that the interpreter cannot produce on its own.
///
/// The caller must inspect the variant, fulfill the request, and pass
/// the result back via [`Runtime::resume`](super::runtime::Runtime::resume).
pub enum Suspension<'ctx, 'heap> {
    /// The interpreter needs the result of a graph read operation.
    GraphRead(GraphReadSuspension<'ctx, 'heap>),
}

/// Suspension state for a [`GraphRead`] terminator.
///
/// Contains the MIR graph read definition and the evaluated temporal axis,
/// which together provide everything the caller needs to execute the query.
///
/// Call [`resolve`](Self::resolve) with the query result to produce a
/// [`Continuation`] for resuming the interpreter.
pub struct GraphReadSuspension<'ctx, 'heap> {
    pub body: DefId,
    pub block: BasicBlockId,

    /// The graph read terminator that caused the suspension.
    pub read: &'ctx GraphRead<'heap>,
    /// The evaluated temporal axis for the query.
    pub axis: TemporalAxesInterval,
}

impl<'ctx, 'heap> GraphReadSuspension<'ctx, 'heap> {
    /// Resolves this suspension with the query result, producing a [`Continuation`].
    pub const fn resolve<A: Allocator>(
        self,
        value: Value<'heap, A>,
    ) -> Continuation<'ctx, 'heap, A> {
        Continuation::GraphRead(GraphReadContinuation {
            read: self.read,
            value,
        })
    }
}

/// The fulfilled result of a [`Suspension`], ready to be fed back into the
/// interpreter via [`Runtime::resume`](super::runtime::Runtime::resume).
pub enum Continuation<'ctx, 'heap, A: Allocator> {
    /// Fulfilled result of a [`GraphRead`] suspension.
    GraphRead(GraphReadContinuation<'ctx, 'heap, A>),
}

impl<'ctx, 'heap, A: Allocator> Continuation<'ctx, 'heap, A> {
    /// Applies a [`Continuation`] to the suspended call stack.
    ///
    /// Writes the continuation's result value into the target block's parameter
    /// and advances the frame to that block.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError::CallstackEmpty`] if the call stack has no frames.
    pub fn apply<E>(
        self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
    ) -> Result<(), RuntimeError<'heap, E, A>> {
        match self {
            Continuation::GraphRead(GraphReadContinuation { read, value }) => {
                let Some(frame) = callstack.frames.last_mut() else {
                    return Err(RuntimeError::CallstackEmpty);
                };

                #[cfg(debug_assertions)]
                {
                    use crate::body::terminator::TerminatorKind;

                    let current_block = frame.current_block;
                    let current_statement = frame.current_statement;
                    debug_assert_eq!(current_block.block.statements.len(), current_statement);

                    debug_assert_matches!(
                        current_block.block.terminator.kind,
                        TerminatorKind::GraphRead(_)
                    );
                }

                let next_block = &frame.body.basic_blocks[read.target];
                let params = next_block.params;
                debug_assert_eq!(params.len(), 1);

                frame.locals.insert(params[0], value);

                frame.current_block = CurrentBlock {
                    id: read.target,
                    block: next_block,
                };
                frame.current_statement = 0;

                Ok(())
            }
        }
    }
}

/// Carries the result of a graph read query back to the interpreter.
#[expect(clippy::field_scoped_visibility_modifiers)]
pub struct GraphReadContinuation<'ctx, 'heap, A: Allocator> {
    pub(crate) read: &'ctx GraphRead<'heap>,
    pub(crate) value: Value<'heap, A>,
}
