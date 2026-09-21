//! The blocking generation operations, run off the maintenance loop.
//!
//! Opening maps and verifies a generation's artifacts, while removal unlinks its directory. The
//! offload pool performs both blocking filesystem operations, and the manager retains handles it
//! can probe or await.

use alloc::sync::Arc;
use core::{panic::AssertUnwindSafe, pin, task};

use error_stack::{Report, ResultExt as _};
use futures::FutureExt as _;
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

/// A generation operation running on the offload pool.
///
/// Opening, current-pointer reads and directory removal are all blocking filesystem operations.
/// Maintenance must not block on them, so [`try_join`](Self::try_join) probes for a completed
/// result. The [`Future`] implementation lets shutdown await completion. Dropping the handle
/// abandons the result but does not cancel work already submitted to Rayon.
///
/// An [`OffloadState::Running`] probe leaves the handle available for another probe or await. Every
/// other probe result consumes the one-shot. A subsequent probe returns [`ManagerError::Offload`],
/// including after a successful operation.
///
/// # Panics
///
/// Polling through [`Future`] after a terminal probe or a completed poll panics.
pub(crate) struct RuntimeSourceHandle<T>(OffloadHandle<Result<T, Report<ManagerError>>>);

impl<T> RuntimeSourceHandle<T> {
    /// Takes the operation's result when it is already available.
    ///
    /// # Errors
    ///
    /// Returns the operation's own [`ManagerError`], or [`ManagerError::Offload`] when the worker
    /// panics, exits without delivering a result, or this handle's result has already been
    /// consumed.
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

    /// Polls the offloaded step and flattens its two failure shapes into one.
    ///
    /// The operation's own failure passes through unchanged. A worker panic or disappearance
    /// becomes [`ManagerError::Offload`], giving both failure shapes the same result type.
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
    /// The directory published generations live under.
    pub root: GenerationRoot,
    /// The server secret used to derive an opened world's wire-ID codecs.
    pub secret: ServeSecret,
    /// The store connection pool a started feed reads through.
    pub pool: Arc<PostgresStorePool>,
    /// The feed configuration, absent where the deployment serves without one.
    pub feed: Option<FeedOptions>,
}

impl RuntimeSource {
    /// Reads the root's current-generation pointer.
    ///
    /// Returns [`None`] when no current pointer selects a generation, including when unselected
    /// generation directories exist.
    pub(super) fn current(self: Arc<Self>) -> RuntimeSourceHandle<Option<GenerationId>> {
        RuntimeSourceHandle(offload::run(AssertUnwindSafe(move || {
            self.root.current().change_context(ManagerError::Current)
        })))
    }

    /// Opens `generation` or reuses `world` as a runtime with optional feed execution.
    ///
    /// `Some(world)` ignores `generation` and starts a new delta lifetime over the already-open
    /// artifacts. `None` opens and verifies `generation` first. Reuse avoids repeating artifact
    /// mapping and verification. Either path returns a static reader when feed options or temporal
    /// axes are absent.
    ///
    /// # Panics
    ///
    /// Panics outside a Tokio runtime because the operation captures its handle before either open
    /// path.
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

    /// Unlinks `generation`'s directory.
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

    /// Wraps an offload handle as a source handle, so manager tests can drive one directly.
    pub(in super::super) fn from_offload<T>(
        handle: OffloadHandle<Result<T, Report<ManagerError>>>,
    ) -> RuntimeSourceHandle<T> {
        RuntimeSourceHandle(handle)
    }
}
