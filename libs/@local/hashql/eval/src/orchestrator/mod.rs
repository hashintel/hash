//! Orchestration layer between the MIR interpreter and external data sources.
//!
//! The interpreter executes HashQL programs as bytecode, but cannot satisfy data
//! access on its own. When execution reaches a [`GraphRead`] terminator, the
//! interpreter yields a [`Suspension`] describing what data is needed and where
//! to resume. The orchestrator takes over: it looks up the pre-compiled SQL
//! query, encodes parameters, sends the query to PostgreSQL, hydrates each
//! result row into a typed [`Value`], runs any client-side filter chains, and
//! packages the output into a [`Continuation`] that the interpreter can apply to
//! resume execution.
//!
//! Key types:
//!
//! - [`Orchestrator`]: top-level driver that owns the database client and query registry. Provides
//!   [`run_in`] for full query execution and [`fulfill_in`] for resolving a single suspension.
//! - [`Indexed`]: positional wrapper used to carry a column's index alongside its descriptor
//!   through the hydration pipeline.
//!
//! Submodules:
//!
//! - `codec`: JSON serialization (parameter encoding) and deserialization (result column decoding)
//!   between [`Value`] and the PostgreSQL wire format.
//! - `partial`: three-state hydration tracking that assembles flat result columns into nested
//!   entity [`Value`] trees.
//! - `postgres`: continuation state management for multi-island execution where the interpreter
//!   resumes after a database round-trip.
//! - `request`: per-suspension-type orchestrators (currently [`GraphRead`]).
//! - `tail`: result accumulation strategies (currently collection into a list).
//! - `error`: error types for all failure modes in the bridge.
//!
//! [`GraphRead`]: hashql_mir::body::terminator::GraphRead
//! [`Suspension`]: hashql_mir::interpret::suspension::Suspension
//! [`Value`]: hashql_mir::interpret::value::Value
//! [`Continuation`]: hashql_mir::interpret::suspension::Continuation
//! [`run_in`]: Orchestrator::run_in
//! [`fulfill_in`]: Orchestrator::fulfill_in

use alloc::alloc::Global;
use core::{alloc::Allocator, marker::PhantomData, ops::Deref};

use hashql_mir::{
    def::DefId,
    interpret::{
        CallStack, Inputs, Runtime, RuntimeConfig, RuntimeError,
        suspension::{Continuation, Suspension},
        value::Value,
    },
};
use tokio_postgres::Client;

use self::{error::BridgeError, request::GraphReadOrchestrator};
use crate::{context::EvalContext, postgres::PreparedQueries};

mod codec;
pub(crate) mod error;
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
/// configuration; `A` is the allocator used by the query registry.
///
/// Use [`run_in`](Self::run_in) to execute a complete query from scratch, or
/// [`fulfill_in`](Self::fulfill_in) / [`fulfill`](Self::fulfill) to resolve an
/// individual [`Suspension`] when driving the interpreter manually.
///
/// [`Suspension`]: hashql_mir::interpret::suspension::Suspension
pub struct Orchestrator<'env, 'ctx, 'heap, C, A: Allocator> {
    client: Client,
    queries: &'env PreparedQueries<'heap, A>,
    context: &'env EvalContext<'ctx, 'heap, A>,

    _marker: PhantomData<C>,
}

#[expect(clippy::future_not_send)]
impl<'ctx, 'heap, C, A: Allocator> Orchestrator<'_, 'ctx, 'heap, C, A> {
    /// Executes a complete query, resolving suspensions in a loop until the
    /// interpreter returns a final [`Value`].
    ///
    /// Creates a fresh [`Runtime`] and [`CallStack`], then alternates between
    /// running the interpreter and fulfilling suspensions until the program
    /// either returns or fails.
    ///
    /// `L` is the allocator for runtime values and intermediate results.
    ///
    /// # Errors
    ///
    /// Returns a [`RuntimeError`] if the interpreter fails or any suspension
    /// cannot be fulfilled (database errors, decoding failures, etc.).
    ///
    /// [`Value`]: hashql_mir::interpret::value::Value
    pub async fn run_in<L: Allocator + Clone>(
        &self,
        inputs: &Inputs<'heap, L>,

        body: DefId,
        args: impl IntoIterator<Item = Value<'heap, L>, IntoIter: ExactSizeIterator>,

        alloc: L,
    ) -> Result<Value<'heap, L>, RuntimeError<'heap, BridgeError<'heap>, L>> {
        let mut runtime = Runtime::new_in(
            RuntimeConfig::default(),
            self.context.bodies,
            inputs,
            alloc.clone(),
        );
        runtime.reset();

        let mut callstack = CallStack::new(&runtime, body, args);

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
    ) -> Result<Continuation<'ctx, 'heap, L>, RuntimeError<'heap, BridgeError<'heap>, L>> {
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
    {
        self.fulfill_in(inputs, callstack, suspension, Global).await
    }
}
