use alloc::sync::Arc;
use core::{panic::AssertUnwindSafe, pin, task};

use error_stack::{Report, ResultExt as _};
use futures::FutureExt;
use hash_graph_postgres_store::store::PostgresStorePool;
use rand::rngs::SysRng;
use tokio::runtime::Handle;

use super::error::ManagerError;
use crate::{
    file::generation::{GenerationId, GenerationRoot},
    offload::{self, OffloadHandle, OffloadState},
    serve::{
        runtime::{FeedOptions, Runtime},
        secret::ServeSecret,
        world::World,
    },
};

pub(crate) struct RuntimeSourceHandle<T>(OffloadHandle<Result<T, Report<ManagerError>>>);

impl<T> RuntimeSourceHandle<T> {
    pub(crate) fn try_join(&mut self) -> Result<OffloadState<T>, Report<ManagerError>> {
        match self.0.try_join() {
            Ok(OffloadState::Running) => Ok(OffloadState::Running),
            Ok(OffloadState::Finished(Ok(result))) => Ok(OffloadState::Finished(result)),
            Ok(OffloadState::Finished(Err(error))) => Err(error),
            Err(offload) => Err(Report::new(offload).change_context(ManagerError::Offload)),
        }
    }
}

impl<T> Future for RuntimeSourceHandle<T> {
    type Output = Result<T, Report<ManagerError>>;

    fn poll(mut self: pin::Pin<&mut Self>, cx: &mut task::Context<'_>) -> task::Poll<Self::Output> {
        self.0.poll_unpin(cx).map(|result| match result {
            Ok(Ok(current)) => Ok(current),
            Err(offload) => Err(Report::new(offload).change_context(ManagerError::Offload)),
            Ok(Err(error)) => Err(error),
        })
    }
}

/// Shared resources for opening generations and restarting their feeds.
pub(crate) struct RuntimeSource {
    pub root: GenerationRoot,
    pub secret: ServeSecret,
    pub pool: Arc<PostgresStorePool>,
    pub feed: Option<FeedOptions>,
}

impl RuntimeSource {
    pub(super) fn current(self: Arc<Self>) -> RuntimeSourceHandle<Option<GenerationId>> {
        RuntimeSourceHandle(offload::run(AssertUnwindSafe(move || {
            self.root.current().change_context(ManagerError::Current)
        })))
    }

    pub(super) fn open(
        self: Arc<Self>,
        generation: GenerationId,
        world: Option<Arc<World>>,
    ) -> RuntimeSourceHandle<Runtime> {
        let handle = Handle::current();

        RuntimeSourceHandle(offload::run(AssertUnwindSafe(move || {
            // Feed initialization starts Tokio tasks from the Rayon worker.
            let _entered = handle.enter();

            let feed = self.feed.clone();
            let pool = Arc::clone(&self.pool);

            if let Some(world) = world {
                Runtime::start(world, pool, SysRng, feed).change_context(ManagerError::Runtime)
            } else {
                let generation = self
                    .root
                    .open(generation)
                    .change_context(ManagerError::Open)?;

                Runtime::open(generation, &self.secret, pool, SysRng, feed)
                    .change_context(ManagerError::Runtime)
            }
        })))
    }

    pub(super) fn remove(self: Arc<Self>, generation: GenerationId) -> RuntimeSourceHandle<()> {
        RuntimeSourceHandle(offload::run(AssertUnwindSafe(move || {
            self.root
                .remove(generation)
                .change_context(ManagerError::Remove)
        })))
    }
}

#[cfg(test)]
pub(super) mod tests {
    use error_stack::Report;

    use super::{ManagerError, OffloadHandle, RuntimeSourceHandle};

    pub(in super::super) fn from_offload<T>(
        handle: OffloadHandle<Result<T, Report<ManagerError>>>,
    ) -> RuntimeSourceHandle<T> {
        RuntimeSourceHandle(handle)
    }
}
