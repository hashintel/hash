//! Opt-in event tracing for the orchestrator execution pipeline.
//!
//! The orchestrator emits [`Event`]s at key decision points: query dispatch,
//! row hydration, filter evaluation, island transitions, and result collection.
//! An [`EventLog`] sink receives them. The default `()` implementation compiles
//! to a no-op with zero runtime cost. [`AppendEventLog`] collects events into
//! a [`Vec`] for test assertions.
//!
//! # Design
//!
//! All [`Event`] variants are `Copy`. This guarantees that the `()` sink
//! optimizes away completely: no allocation, no drop glue, no residual code
//! in the dispatch loop. Non-`Copy` payloads (e.g. [`String`]) would prevent
//! LLVM from eliminating dead event construction even through a no-op sink.
//!
//! [`EventLog::log`] takes `&self` rather than `&mut self` so that events can
//! be emitted through shared borrows of the [`Orchestrator`]. Interior
//! mutability is handled by the sink implementation ([`AppendEventLog`] uses
//! a [`LocalLock`]).
//!
//! [`Orchestrator`]: super::Orchestrator

use core::{
    fmt::{self, Display},
    mem,
};

use hashql_core::sync::lock::LocalLock;
use hashql_mir::{
    body::basic_block::BasicBlockId,
    def::DefId,
    pass::execution::{IslandId, TargetId},
};

/// A single orchestrator execution event.
///
/// Each variant captures the structured data needed to reconstruct what
/// happened at a particular point in the execution pipeline. Formatting
/// is the listener's responsibility; use the [`Display`] implementation
/// for human-readable output.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Event {
    /// SQL query dispatched to PostgreSQL.
    QueryExecuted { body: DefId, block: BasicBlockId },
    /// A result row was received from PostgreSQL.
    RowReceived,

    /// A filter body started evaluating for the current row.
    FilterStarted { body: DefId },
    /// The filter accepted the current row.
    FilterAccepted { body: DefId },
    /// The filter rejected the current row.
    FilterRejected { body: DefId },

    /// Entered an execution island within a filter body.
    IslandEntered {
        body: DefId,
        island: IslandId,
        target: TargetId,
    },
    /// Postgres continuation state was flushed into the callstack.
    ContinuationFlushed { body: DefId, island: IslandId },
    /// Postgres island had no continuation state (implicit true).
    ContinuationImplicitTrue { body: DefId },

    /// A row survived all filters and was added to the output.
    RowAccepted,
    /// A row was rejected by the filter chain.
    RowRejected,
}

impl Display for Event {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::QueryExecuted { body, block } => {
                write!(f, "query executed: body {body}, block {block}")
            }
            Self::RowReceived => f.write_str("row received"),
            Self::FilterStarted { body } => write!(f, "filter started: body {body}"),
            Self::FilterAccepted { body } => write!(f, "filter accepted: body {body}"),
            Self::FilterRejected { body } => write!(f, "filter rejected: body {body}"),
            Self::IslandEntered {
                body,
                island,
                target,
            } => write!(
                f,
                "island entered: body {body}, island {island}, target {target}"
            ),
            Self::ContinuationFlushed { body, island } => {
                write!(f, "continuation flushed: body {body}, island {island}")
            }
            Self::ContinuationImplicitTrue { body } => {
                write!(f, "continuation implicit true: body {body}")
            }
            Self::RowAccepted => f.write_str("row accepted"),
            Self::RowRejected => f.write_str("row rejected"),
        }
    }
}

/// Receiver for orchestrator [`Event`]s.
///
/// Implement this trait to observe execution decisions without modifying
/// the orchestrator's control flow. The method takes `&self` to allow
/// emission through shared borrows; implementations that need mutation
/// should use interior mutability (e.g. [`LocalLock`]).
///
/// The `()` implementation discards all events and compiles to a no-op.
pub trait EventLog {
    /// Records a single event.
    fn log(&self, event: Event);
}

impl EventLog for () {
    #[inline(always)]
    fn log(&self, _: Event) {}
}

impl<T: EventLog> EventLog for &T {
    #[inline]
    fn log(&self, event: Event) {
        T::log(self, event);
    }
}

/// An [`EventLog`] that appends events to an internal [`Vec`].
///
/// Uses a [`LocalLock`] for interior mutability so that [`log`](EventLog::log)
/// can be called through `&self`. Retrieve collected events with [`take`](Self::take),
/// which drains the buffer.
#[derive(Debug)]
pub struct AppendEventLog(LocalLock<Vec<Event>>);

impl AppendEventLog {
    /// Creates an empty event log.
    #[must_use]
    pub const fn new() -> Self {
        Self(LocalLock::new(Vec::new()))
    }

    /// Drains and returns all collected events, leaving the buffer empty.
    pub fn take(&self) -> Vec<Event> {
        mem::take(&mut *self.0.lock())
    }
}

impl Default for AppendEventLog {
    fn default() -> Self {
        Self::new()
    }
}

impl EventLog for AppendEventLog {
    fn log(&self, event: Event) {
        self.0.lock().push(event);
    }
}
