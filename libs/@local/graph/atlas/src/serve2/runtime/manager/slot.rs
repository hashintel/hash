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
    serve2::{
        runtime::{FeedState, Runtime},
        world::World,
    },
};

/// Admission history used to distinguish failed candidates from expired generations.
pub(super) enum Registration {
    Candidate,
    Published,
    Expired,
}

pub(super) enum Execution {
    Opening {
        world: Option<Arc<World>>,
        task: RuntimeSourceHandle<Runtime>,
    },
    Ready(Runtime),
    Running(Runtime),
    Joining(Runtime),
    Stopped(Option<Arc<World>>),
    Removing(RuntimeSourceHandle<()>),
    Removed,
}

impl Execution {
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
    pub(super) const fn candidate() -> Self {
        Self {
            registration: Registration::Candidate,
            execution: Execution::Stopped(None),
        }
    }

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

    pub(super) fn expire(&mut self) {
        self.registration = Registration::Expired;
        self.stop();
    }

    pub(super) fn stop(&mut self) {
        self.execution.stop();
    }

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

    pub(super) fn open(&mut self, source: Arc<RuntimeSource>, generation: GenerationId) {
        if let Execution::Stopped(world) = &mut self.execution {
            let world = world.take();

            let task = source.open(generation, world.as_ref().map(Arc::clone));
            self.execution = Execution::Opening { world, task };
        }
    }

    pub(super) fn remove(&mut self, source: Arc<RuntimeSource>, generation: GenerationId) {
        self.execution = Execution::Removing(source.remove(generation));
    }

    pub(super) const fn is_stopped(&self) -> bool {
        matches!(self.execution, Execution::Stopped(_) | Execution::Removed)
    }
}
