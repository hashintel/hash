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

use core::alloc::Allocator;

pub(crate) use self::graph_read::extract_axis;
pub use self::temporal::{TemporalAxesInterval, TemporalInterval, Timestamp};
use super::value::Value;
use crate::{
    body::{basic_block::BasicBlockId, terminator::GraphRead},
    def::DefId,
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

/// Carries the result of a graph read query back to the interpreter.
#[expect(clippy::field_scoped_visibility_modifiers)]
pub struct GraphReadContinuation<'ctx, 'heap, A: Allocator> {
    pub(crate) read: &'ctx GraphRead<'heap>,
    pub(crate) value: Value<'heap, A>,
}
