//! One generation's execution state machine.
//!
//! [`GenerationManager`](super::GenerationManager) stores one slot per generation to track its
//! execution and publication history. It drives slot transitions during maintenance and shutdown,
//! including drop-triggered stop requests.

use alloc::sync::Arc;
use core::{
    mem,
    task::{Context, Poll, ready},
};

use futures::FutureExt as _;

use super::source::{RuntimeSource, RuntimeSourceHandle};
use crate::{
    file::generation::GenerationId,
    offload::OffloadState,
    serve::{
        runtime::{FeedState, Runtime},
        world::World,
    },
};

/// Admission history used to distinguish failed candidates from expired generations.
pub(super) enum Registration {
    /// Selected but never promoted, with no publications to retain after stopping.
    Candidate,
    /// Promoted at least once, so requests may still hold its publications.
    Published,
    /// Published, and past the retention interval that followed its replacement.
    Expired,
}

/// Where one generation stands in the open, run, join, remove sequence.
///
/// The states cycle. A stopped generation that becomes wanted reopens, and a failed opening
/// returns to stopped for retry during the next maintenance pass. [`Execution::Opening`] and
/// [`Execution::Stopped`] may retain an opened world, allowing a reopened generation to skip
/// repeated artifact mapping.
pub(super) enum Execution {
    /// An opening is running on the offload pool.
    Opening {
        /// The world a previous opening left mapped, reused by this one.
        world: Option<Arc<World>>,
        /// The opening's handle.
        task: RuntimeSourceHandle<Runtime>,
    },
    /// Initialized and not yet promoted.
    Ready(Runtime),
    /// Promoted, with requests reading its publications.
    Running(Runtime),
    /// Shutdown requested, waiting for the feed's result.
    Joining(Runtime),
    /// Not running, retaining the opened world where one survived.
    Stopped(Option<Arc<World>>),
    /// The generation's directory is being unlinked.
    Removing(RuntimeSourceHandle<()>),
    /// The directory is gone and the slot may leave the manager.
    Removed,
}

impl Execution {
    /// Requests feed shutdown, moving an initialized runtime into joining.
    ///
    /// Every other state already has its shutdown underway or behind it.
    fn stop(&mut self) {
        if matches!(self, Self::Ready(_) | Self::Running(_)) {
            let (Self::Ready(runtime) | Self::Running(runtime)) =
                mem::replace(self, Self::Stopped(None))
            else {
                unreachable!("only initialized runtimes enter joining");
            };
            runtime.stop();
            *self = Self::Joining(runtime);
        }
    }

    /// Advances as far as the already-available results allow.
    ///
    /// The loop runs because one finished operation can enable the next: an opening that finished
    /// leaves a ready runtime, and a joined feed leaves a stopped slot the same pass can reopen.
    /// Each arm returns rather than looping where its operation is still running.
    fn tick(&mut self, generation: GenerationId) {
        loop {
            let next = match self {
                Self::Opening { world, task } => match task.try_join() {
                    Ok(OffloadState::Finished(runtime)) => Self::Ready(runtime),
                    Ok(OffloadState::Running) => return,
                    Err(error) => {
                        tracing::warn!(%generation, ?error, "retrying generation initialization");

                        Self::Stopped(world.take())
                    }
                },
                Self::Running(runtime) => {
                    match runtime.try_join() {
                        Ok(FeedState::Finished) => {
                            tracing::warn!(%generation, "generation feed ended prematurely");
                        }
                        Err(error) => {
                            tracing::warn!(%generation, ?error, "unable to join runtime, generation feed failed");
                        }
                        Ok(FeedState::Absent | FeedState::Running) => return,
                    }

                    Self::Stopped(Some(Arc::clone(runtime.world())))
                }
                Self::Joining(runtime) => {
                    match runtime.try_join() {
                        Ok(FeedState::Absent | FeedState::Finished) => {}
                        Err(error) => {
                            tracing::warn!(%generation, ?error, "unable to join runtime, generation feed failed");
                        }
                        Ok(FeedState::Running) => return,
                    }

                    Self::Stopped(Some(Arc::clone(runtime.world())))
                }
                Self::Removing(task) => match task.try_join() {
                    Ok(OffloadState::Finished(())) => {
                        tracing::info!(%generation, "removed expired generation");

                        Self::Removed
                    }
                    Ok(OffloadState::Running) => return,
                    Err(error) => {
                        tracing::warn!(%generation, ?error, "failed to remove expired generation");
                        // Removal may fail after deleting only part of the directory. Reopening
                        // must validate its remaining artifacts.
                        Self::Stopped(None)
                    }
                },
                Self::Ready(_) | Self::Stopped(_) | Self::Removed => return,
            };

            *self = next;
        }
    }
}

/// Execution ownership independent of the registry's retained request publications.
pub(super) struct RuntimeSlot {
    pub registration: Registration,
    pub execution: Execution,
}

impl RuntimeSlot {
    /// Returns an unopened slot for a generation the manager selected but never published.
    pub(super) const fn candidate() -> Self {
        Self {
            registration: Registration::Candidate,
            execution: Execution::Stopped(None),
        }
    }

    /// Borrows the slot's initialized runtime, absent in every other execution state.
    pub(super) const fn runtime(&self) -> Option<&Runtime> {
        match &self.execution {
            Execution::Ready(runtime) | Execution::Running(runtime) => Some(runtime),
            Execution::Opening { .. }
            | Execution::Joining(_)
            | Execution::Stopped(_)
            | Execution::Removing(_)
            | Execution::Removed => None,
        }
    }

    /// Records publication and moves a ready runtime into running.
    pub(super) fn promote(&mut self) {
        self.registration = Registration::Published;
        if matches!(self.execution, Execution::Ready(_)) {
            let Execution::Ready(runtime) =
                mem::replace(&mut self.execution, Execution::Stopped(None))
            else {
                unreachable!("only a ready runtime changes to running");
            };
            self.execution = Execution::Running(runtime);
        }
    }

    /// Records that retention has elapsed and requests shutdown.
    pub(super) fn expire(&mut self) {
        self.registration = Registration::Expired;
        self.stop();
    }

    /// Requests feed shutdown without waiting.
    pub(super) fn stop(&mut self) {
        self.execution.stop();
    }

    /// Advances the slot's execution as far as available results allow.
    pub(super) fn tick(&mut self, generation: GenerationId) {
        self.execution.tick(generation);
    }

    /// Stops initialized feeds and polls every operation this slot already owns.
    pub(super) fn poll_shutdown(
        &mut self,
        generation: GenerationId,
        context: &mut Context<'_>,
    ) -> Poll<()> {
        loop {
            let next = match &mut self.execution {
                Execution::Opening { world, task } => match ready!(task.poll_unpin(context)) {
                    Ok(runtime) => {
                        runtime.stop();
                        Execution::Joining(runtime)
                    }
                    Err(error) => {
                        tracing::warn!(%generation, ?error, "generation initialization failed during shutdown");
                        Execution::Stopped(world.take())
                    }
                },
                Execution::Ready(_) | Execution::Running(_) => {
                    self.stop();
                    continue;
                }
                Execution::Joining(runtime) => {
                    if let Some(Err(error)) = ready!(runtime.poll_join(context)) {
                        tracing::warn!(%generation, ?error, "unable to join runtime, generation feed failed");
                    }
                    Execution::Stopped(Some(Arc::clone(runtime.world())))
                }
                Execution::Removing(task) => match ready!(task.poll_unpin(context)) {
                    Ok(()) => {
                        tracing::info!(%generation, "removed expired generation");
                        Execution::Removed
                    }
                    Err(error) => {
                        tracing::warn!(%generation, ?error, "failed to remove expired generation");
                        Execution::Stopped(None)
                    }
                },
                Execution::Stopped(_) | Execution::Removed => return Poll::Ready(()),
            };

            self.execution = next;
        }
    }

    /// Starts an opening for a stopped slot, reusing a retained world where one survived.
    ///
    /// A repeated call cannot start a second opening. Slots in any other state remain unchanged.
    pub(super) fn open(&mut self, source: Arc<RuntimeSource>, generation: GenerationId) {
        if let Execution::Stopped(world) = &mut self.execution {
            let world = world.take();

            let task = source.open(generation, world.as_ref().map(Arc::clone));
            self.execution = Execution::Opening { world, task };
        }
    }

    /// Starts unlinking the generation's directory.
    pub(super) fn remove(&mut self, source: Arc<RuntimeSource>, generation: GenerationId) {
        self.execution = Execution::Removing(source.remove(generation));
    }

    /// Returns whether the slot has no operation left to poll.
    pub(super) const fn is_stopped(&self) -> bool {
        matches!(self.execution, Execution::Stopped(_) | Execution::Removed)
    }
}
