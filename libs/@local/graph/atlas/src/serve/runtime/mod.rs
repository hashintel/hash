//! Per-generation execution ownership.
//!
//! [`Runtime`] keeps feed shutdown independent of request lifetimes. Retained worlds and
//! publications remain readable after its background work finishes.

use alloc::sync::Arc;
use core::{
    error::Error,
    fmt,
    future::poll_fn,
    task::{Context, Poll, Waker, ready},
};

use error_stack::{Report, ResultExt as _};
use futures::FutureExt as _;
use hash_graph_postgres_store::store::PostgresStorePool;
use rand::TryCryptoRng;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::{
    delta::{Delta, DeltaReader, DeltaTask, DeltaTaskError, DeltaTaskOptions, EmbeddingWorkflow},
    secret::ServeSecret,
    world::World,
};
use crate::{device::PhysicalDevice, file::generation::Generation};

pub(crate) mod manager;
pub(crate) mod registry;
#[cfg(test)]
mod tests;

/// Execution settings for an enabled generation feed.
#[derive(Clone)]
pub(crate) struct FeedOptions {
    pub task: DeltaTaskOptions,
    pub device: PhysicalDevice,
    pub workflow: Option<Arc<EmbeddingWorkflow>>,
}

/// A failure opening or joining a generation's runtime.
#[derive(Debug)]
pub(crate) enum RuntimeError {
    /// The generation's serving artifacts could not be opened.
    World,
    /// Drawing the [delta lifetime identifier](super::delta::DeltaId) failed.
    Entropy,
    /// Opening or running the generation feed failed.
    Feed,
    /// Joining the feed runner failed.
    Join,
}

impl fmt::Display for RuntimeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::World => fmt.write_str("could not open the generation's serving artifacts"),
            Self::Entropy => fmt.write_str("could not initialize the delta identifier"),
            Self::Feed => fmt.write_str("the generation feed failed"),
            Self::Join => fmt.write_str("could not join the generation feed"),
        }
    }
}

impl Error for RuntimeError {}

struct Feed {
    shutdown: CancellationToken,
    task: JoinHandle<Result<(), Report<[DeltaTaskError]>>>,
}

/// The outcome of checking for an unjoined feed runner.
#[derive(Debug)]
enum FeedState {
    /// No runner exists, or an earlier join consumed its result.
    Absent,
    /// A runner exists and its result is not available to this probe yet.
    Running,
    Finished,
}

/// The opened world, publication reader and shutdown authority for one generation.
///
/// Dropping the runtime requests graceful shutdown. [`Self::shutdown`] also joins the runner.
/// Request-held worlds and readers remain valid in either case. Shutdown preserves the generation's
/// directory for subsequent opening or explicit retirement.
#[must_use = "dropping the runtime requests shutdown"]
pub(crate) struct Runtime {
    world: Arc<World>,

    reader: DeltaReader,
    feed: Option<Feed>,
}

impl Runtime {
    /// Opens a world and starts its configured feed after initialization succeeds.
    ///
    /// `None` disables the feed. A generation without temporal axes also has a static reader.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError`] for world opening, entropy or feed initialization failures.
    ///
    /// # Panics
    ///
    /// Panics outside a Tokio runtime when a feed needs to start.
    #[tracing::instrument(skip_all, err, fields(generation = %generation.id()))]
    pub(crate) fn open(
        generation: Generation,
        secret: &ServeSecret,
        pool: Arc<PostgresStorePool>,
        rng: impl TryCryptoRng<Error: Error + Send + Sync + 'static>,
        feed: Option<FeedOptions>,
    ) -> Result<Self, Report<RuntimeError>> {
        let world = World::open(generation, secret).change_context(RuntimeError::World)?;
        Self::start(Arc::new(world), pool, rng, feed)
    }

    /// Starts a fresh [delta lifetime](super::delta::DeltaId) over an already-open world.
    ///
    /// `None` disables the feed. A generation without temporal axes also has a static reader.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError`] for entropy or feed initialization failures.
    ///
    /// # Panics
    ///
    /// Panics outside a Tokio runtime when a feed needs to start.
    #[tracing::instrument(skip_all, err, fields(generation = %world.generation().id()))]
    pub(crate) fn start(
        world: Arc<World>,
        pool: Arc<PostgresStorePool>,
        rng: impl TryCryptoRng<Error: Error + Send + Sync + 'static>,
        feed: Option<FeedOptions>,
    ) -> Result<Self, Report<RuntimeError>> {
        let delta = Delta::new(Arc::clone(&world), rng).change_context(RuntimeError::Entropy)?;
        let (reader, task) = match feed {
            Some(FeedOptions {
                task,
                device,
                workflow,
            }) => DeltaTask::open(delta, pool, task, device, workflow)
                .change_context(RuntimeError::Feed)?,
            None => (DeltaReader::from(delta), None),
        };

        let feed = task.map(|task| {
            let cancel = CancellationToken::new();
            let task = tokio::spawn(task.run(cancel.clone().cancelled_owned()));

            Feed {
                shutdown: cancel,
                task,
            }
        });

        Ok(Self {
            world,
            reader,
            feed,
        })
    }

    pub(crate) const fn world(&self) -> &Arc<World> {
        &self.world
    }

    const fn reader(&self) -> &DeltaReader {
        &self.reader
    }

    /// Requests graceful shutdown without waiting for in-flight work.
    fn stop(&self) {
        if let Some(feed) = &self.feed {
            feed.shutdown.cancel();
        }
    }

    /// Probes the runner without waiting, retaining the handle until a poll returns its result.
    ///
    /// A finished runner can still report [`FeedState::Running`], retaining the handle for a later
    /// probe. Repeated probes can defer the result until a poll has cooperative budget to read it.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError`] for a feed failure or a failed join.
    fn try_join(&mut self) -> Result<FeedState, Report<RuntimeError>> {
        let Some(feed) = self.feed.as_mut() else {
            return Ok(FeedState::Absent);
        };

        if !feed.task.is_finished() {
            return Ok(FeedState::Running);
        }

        // JoinHandle polls consume cooperative budget before reading the output, even after
        // is_finished returns true. This probe uses a no-op waker, which discards notifications.
        // A later pass must therefore poll again for any deferred result.
        let mut probe = Context::from_waker(Waker::noop());
        let Poll::Ready(result) = feed.task.poll_unpin(&mut probe) else {
            return Ok(FeedState::Running);
        };

        self.feed = None;
        result
            .change_context(RuntimeError::Join)
            .and_then(|result| result.change_context(RuntimeError::Feed))
            .map(|()| FeedState::Finished)
    }

    /// Waits for the runner's result, or returns `None` without an unjoined runner.
    ///
    /// Cancelling this wait retains the join handle. A returned result consumes it.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError`] for a feed failure or a failed join.
    async fn join(&mut self) -> Option<Result<(), Report<RuntimeError>>> {
        poll_fn(|context| self.poll_join(context)).await
    }

    fn poll_join(
        &mut self,
        context: &mut Context<'_>,
    ) -> Poll<Option<Result<(), Report<RuntimeError>>>> {
        let Some(feed) = self.feed.as_mut() else {
            return Poll::Ready(None);
        };

        let result = ready!(feed.task.poll_unpin(context));
        self.feed = None;
        Poll::Ready(Some(
            result
                .change_context(RuntimeError::Join)
                .and_then(|result| result.change_context(RuntimeError::Feed)),
        ))
    }

    /// Stops and joins the feed while preserving request-held publications.
    ///
    /// Once polled, cancelling this wait leaves shutdown requested and retains the join handle.
    /// Repeated shutdown after joining succeeds without starting new work.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError`] for a feed failure or a failed join.
    #[tracing::instrument(skip_all, err, fields(generation = %self.world.generation().id()))]
    pub(crate) async fn shutdown(&mut self) -> Result<(), Report<RuntimeError>> {
        self.stop();
        self.join().await.unwrap_or(Ok(()))
    }
}

impl Drop for Runtime {
    fn drop(&mut self) {
        if self.feed.is_some() {
            tracing::warn!(
                generation = %self.world.generation().id(),
                "Drop generation runtime without joining the feed"
            );

            self.stop();
        }
    }
}
