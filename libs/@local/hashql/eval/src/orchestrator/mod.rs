//! Orchestration layer between the MIR interpreter and external data sources.
//!
//! The interpreter executes HashQL programs over MIR bodies but cannot satisfy
//! data access on its own. When execution reaches a [`GraphRead`] terminator,
//! the interpreter yields a [`Suspension`] describing what data is needed and
//! where to resume. The orchestrator takes over: it looks up the pre-compiled
//! SQL query, encodes parameters, sends the query to PostgreSQL, hydrates each
//! result row into a typed [`Value`], runs any client-side filter chains, and
//! packages the output into a [`Continuation`] that the interpreter can apply
//! to resume execution.
//!
//! Key types:
//!
//! - [`Orchestrator`]: top-level driver that owns the database client and query registry. Provides
//!   [`run_in`] for full query execution and [`fulfill_in`] for resolving a single suspension.
//! - [`Indexed`]: positional wrapper that carries a column's index alongside its descriptor through
//!   the hydration pipeline, used for error reporting.
//!
//! Submodules:
//!
//! - `codec`: JSON codec between interpreter [`Value`]s and the PostgreSQL wire format. The
//!   `decode` side deserializes result columns into typed values guided by the HashQL type system;
//!   the `encode` side serializes runtime values and query parameters for transmission to
//!   PostgreSQL.
//! - `partial`: three-state hydration tracking (Skipped, Null, Value) that assembles flat result
//!   columns into nested vertex value trees. Each `Partial*` struct mirrors a level of the vertex
//!   type hierarchy.
//! - `postgres`: continuation state for multi-island execution. When a compiled query returns
//!   continuation columns (target block, locals, serialized values), this module hydrates and
//!   validates them, then flushes the decoded state into the interpreter's callstack.
//! - `request`: per-suspension-type handlers (currently [`GraphRead`]).
//! - `tail`: result accumulation strategies (currently collection into a list).
//! - `error`: error types for all failure modes in the bridge. All variants use `Severity::Bug`
//!   because the user wrote HashQL, not SQL: if the bridge fails, the compiler or runtime produced
//!   something invalid.
//!
//! [`GraphRead`]: hashql_mir::body::terminator::GraphRead
//! [`Suspension`]: hashql_mir::interpret::suspension::Suspension
//! [`Value`]: hashql_mir::interpret::value::Value
//! [`Continuation`]: hashql_mir::interpret::suspension::Continuation
//! [`run_in`]: Orchestrator::run_in
//! [`fulfill_in`]: Orchestrator::fulfill_in

use alloc::alloc::Global;
use core::{alloc::Allocator, ops::Deref};

use hashql_mir::{
    def::DefId,
    interpret::{
        CallStack, Inputs, Runtime, RuntimeConfig, RuntimeError,
        error::InterpretDiagnostic,
        suspension::{Continuation, Suspension},
        value::Value,
    },
};
use tokio_postgres::Client;

pub use self::events::{AppendEventLog, Event, EventLog};
use self::{error::BridgeError, request::GraphReadOrchestrator};
use crate::{context::EvalContext, postgres::PreparedQueries};

pub mod codec;
pub(crate) mod error;
mod events;
mod partial;
mod postgres;
mod request;
mod tail;

/// A value paired with its positional index.
///
/// Used throughout the hydration pipeline to carry a column's index alongside
/// its [`ColumnDescriptor`] so that error diagnostics can report both *which*
/// column failed and *what* it represents.
///
/// Dereferences to the inner value, so callers can access the descriptor
/// transparently.
///
/// [`ColumnDescriptor`]: crate::postgres::ColumnDescriptor
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Indexed<T> {
    pub index: usize,
    value: T,
}

impl<T> Indexed<T> {
    pub(crate) const fn new(index: usize, value: T) -> Self {
        Self { index, value }
    }
}

impl<T> Deref for Indexed<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}

/// Top-level driver that bridges the MIR interpreter with PostgreSQL.
///
/// Owns a database [`Client`], a reference to the compiled query registry, and
/// the evaluation context (type environment, body definitions, execution
/// analysis results). The type parameter `C` is reserved for future
/// configuration; `A` is the allocator used by the query registry; `E` is
/// the [`EventLog`] sink for execution tracing.
///
/// By default `E` is `()`, which compiles all event logging to no-ops. Use
/// [`with_event_log`](Self::with_event_log) to attach a collector such as
/// [`AppendEventLog`] for test assertions or debugging.
///
/// Use [`run_in`](Self::run_in) to execute a complete query from scratch, or
/// [`fulfill_in`](Self::fulfill_in) / [`fulfill`](Self::fulfill) to resolve an
/// individual [`Suspension`] when driving the interpreter manually.
///
/// [`Suspension`]: hashql_mir::interpret::suspension::Suspension
pub struct Orchestrator<'env, 'ctx, 'heap, C, E, A: Allocator> {
    client: C,
    queries: &'env PreparedQueries<'heap, A>,
    context: &'env EvalContext<'ctx, 'heap, A>,
    /// Event sink for execution tracing. See [`EventLog`].
    pub event_log: E,
}

impl<'env, 'ctx, 'heap, C, A: Allocator> Orchestrator<'env, 'ctx, 'heap, C, (), A> {
    pub const fn new(
        client: C,
        queries: &'env PreparedQueries<'heap, A>,
        context: &'env EvalContext<'ctx, 'heap, A>,
    ) -> Self {
        Self {
            client,
            queries,
            context,
            event_log: (),
        }
    }
}

impl<'env, 'ctx, 'heap, C, E, A: Allocator> Orchestrator<'env, 'ctx, 'heap, C, E, A> {
    /// Replaces the event log, returning a new orchestrator with the given
    /// sink.
    pub fn with_event_log<E2>(self, event_log: E2) -> Orchestrator<'env, 'ctx, 'heap, C, E2, A> {
        Orchestrator {
            client: self.client,
            queries: self.queries,
            context: self.context,
            event_log,
        }
    }
}

#[expect(clippy::future_not_send)]
impl<'ctx, 'heap, C, E: EventLog, A: Allocator> Orchestrator<'_, 'ctx, 'heap, C, E, A> {
    /// Executes a complete query, resolving suspensions in a loop until the
    /// interpreter returns a final [`Value`].
    ///
    /// Creates a fresh [`Runtime`] and [`CallStack`], then alternates between
    /// running the interpreter and fulfilling suspensions until the program
    /// either returns or fails. On failure, the callstack is unwound to
    /// produce span information for the diagnostic.
    ///
    /// `L` is the allocator for runtime values and intermediate results.
    ///
    /// # Errors
    ///
    /// Returns an [`InterpretDiagnostic`] if the interpreter fails or any
    /// suspension cannot be fulfilled (database errors, decoding failures,
    /// filter evaluation failures).
    ///
    /// [`Value`]: hashql_mir::interpret::value::Value
    pub async fn run_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,

        body: DefId,
        args: impl IntoIterator<Item = Value<'heap, L>, IntoIter: ExactSizeIterator>,

        alloc: L,
    ) -> Result<Value<'heap, L>, InterpretDiagnostic>
    where
        C: AsRef<Client>,
    {
        let mut runtime = Runtime::new_in(
            RuntimeConfig::default(),
            self.context.bodies,
            inputs,
            alloc.clone(),
        );
        runtime.reset();

        let mut callstack = CallStack::new(&runtime, body, args);

        let Err(error) = try {
            loop {
                let next = runtime.run_until_suspension(&mut callstack)?;
                match next {
                    hashql_mir::interpret::Yield::Return(value) => {
                        return Ok(value);
                    }
                    hashql_mir::interpret::Yield::Suspension(suspension) => {
                        let continuation = self
                            .fulfill_in(inputs, &callstack, suspension, alloc.clone())
                            .await?;

                        continuation.apply(&mut callstack)?;
                    }
                }
            }
        };

        Err(
            error.into_diagnostic(callstack.unwind().map(|(_, span)| span), |suspension| {
                let span = callstack
                    .unwind()
                    .next()
                    .map_or(self.context.bodies[body].span, |(_, span)| span);

                suspension.into_diagnostic(span, self.context.env)
            }),
        )
    }

    /// Convenience wrapper around [`run_in`](Self::run_in) that uses the
    /// [`Global`] allocator.
    ///
    /// # Errors
    ///
    /// Returns an [`InterpretDiagnostic`] on failure. See
    /// [`run_in`](Self::run_in).
    pub async fn run(
        &self,
        inputs: &Inputs<'heap, Global>,
        body: DefId,
        args: impl IntoIterator<Item = Value<'heap, Global>, IntoIter: ExactSizeIterator>,
    ) -> Result<Value<'heap, Global>, InterpretDiagnostic>
    where
        C: AsRef<Client>,
    {
        self.run_in(inputs, body, args, Global).await
    }

    /// Resolves a single [`Suspension`] by dispatching to the appropriate
    /// request handler.
    ///
    /// Currently only [`GraphRead`] suspensions are supported. Returns a
    /// [`Continuation`] that the caller
    /// must [`apply`] to the callstack to resume interpretation.
    ///
    /// # Errors
    ///
    /// Returns a [`RuntimeError`] if query execution, row hydration, or
    /// filter evaluation fails.
    ///
    /// [`Suspension`]: hashql_mir::interpret::suspension::Suspension
    /// [`GraphRead`]: hashql_mir::body::terminator::GraphRead
    /// [`Continuation`]: hashql_mir::interpret::suspension::Continuation
    /// [`apply`]: hashql_mir::interpret::suspension::Continuation::apply
    pub async fn fulfill_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,
        callstack: &CallStack<'ctx, 'heap, L>,
        suspension: Suspension<'ctx, 'heap>,
        alloc: L,
    ) -> Result<Continuation<'ctx, 'heap, L>, RuntimeError<'heap, BridgeError<'heap>, L>>
    where
        C: AsRef<Client>,
    {
        match suspension {
            Suspension::GraphRead(suspension) => {
                GraphReadOrchestrator::new(self)
                    .fulfill_in(inputs, callstack, suspension, alloc)
                    .await
            }
        }
    }

    /// Convenience wrapper around [`fulfill_in`](Self::fulfill_in) that uses
    /// the [`Global`] allocator.
    ///
    /// # Errors
    ///
    /// Returns a [`RuntimeError`] if query execution, row hydration, or
    /// filter evaluation fails. See [`fulfill_in`](Self::fulfill_in).
    pub async fn fulfill(
        &self,
        inputs: &Inputs<'heap, Global>,
        callstack: &CallStack<'ctx, 'heap, Global>,
        suspension: Suspension<'ctx, 'heap>,
    ) -> Result<Continuation<'ctx, 'heap, Global>, RuntimeError<'heap, BridgeError<'heap>, Global>>
    where
        C: AsRef<Client>,
    {
        self.fulfill_in(inputs, callstack, suspension, Global).await
    }
}
