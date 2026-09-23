//! Per-generation execution ownership.
//!
//! [`Runtime`] keeps feed shutdown independent of request lifetimes. Retained worlds and
//! publications remain readable after its background work finishes. Feed recovery belongs to the
//! [`manager::GenerationManager`]. A runtime itself reports one runner's terminal result.

use alloc::sync::Arc;
use core::{
    error::Error,
    fmt,
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
    /// How the feed polls the store and applies what it reads.
    pub task: DeltaTaskOptions,
    /// The device the feed's embedding work runs on.
    pub device: PhysicalDevice,
    /// The workflow that produces embeddings for new entities, absent where none is configured.
    pub workflow: Option<Arc<EmbeddingWorkflow>>,
}

/// A failure opening or joining a generation's runtime.
#[derive(Debug)]
pub(crate) enum RuntimeError {
    /// The generation's serving artifacts could not be opened.
    World,
    /// Drawing the [delta lifetime tag](super::delta::DeltaId) failed.
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

/// A running feed and the token that asks it to stop.
///
/// The handle is retained until a poll reads its result, letting a runtime report why a feed
/// ended rather than only that it did.
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
    /// The runner ended and this probe consumed its result.
    Finished,
}

/// The opened world, publication reader and shutdown authority for one generation.
///
/// Dropping the runtime requests graceful shutdown. [`Self::stop`] requests it without waiting,
/// and [`Self::poll_join`] then reads the runner's result. Request-held worlds and readers remain
/// valid in either case. Without a feed, the initial publication remains static and can serve for
/// as long as the manager keeps the generation admitted, including indefinitely while it remains
/// current. Shutdown preserves the generation's directory for subsequent opening or explicit
/// retirement.
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
    /// Panics outside a Tokio runtime when a feed needs to start. Feed initialization also panics
    /// if it reaches placement-channel construction with a capacity above
    /// [`tokio::sync::Semaphore::MAX_PERMITS`], as [`DeltaTask::open`] documents.
    #[tracing::instrument(skip_all, err(Debug), fields(generation = %generation.id()))]
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

    /// Starts a new [delta lifetime](super::delta::DeltaId) over an already-open world.
    ///
    /// The new lifetime samples its tag from `rng` without checking whether it matches an earlier
    /// [`DeltaId`](super::delta::DeltaId).
    ///
    /// `None` disables the feed. A generation without temporal axes also has a static reader.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError`] for entropy or feed initialization failures.
    ///
    /// # Panics
    ///
    /// Panics outside a Tokio runtime when a feed needs to start. Feed initialization also panics
    /// if it reaches placement-channel construction with a capacity above
    /// [`tokio::sync::Semaphore::MAX_PERMITS`], as [`DeltaTask::open`] documents.
    #[tracing::instrument(skip_all, err(Debug), fields(generation = %world.generation().id()))]
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

    /// Borrows the opened world, which outlives the runtime through its own reference count.
    pub(crate) const fn world(&self) -> &Arc<World> {
        &self.world
    }

    /// Borrows the publication reader requests observe this generation through.
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

    /// Polls the runner to completion, or returns `None` without an unjoined runner.
    ///
    /// A pending poll retains the join handle for later polling. Polling a ready result consumes
    /// the handle, and a later poll reports `None`.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError`] for a feed failure or a failed join.
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
}

impl Drop for Runtime {
    /// Requests shutdown for an unjoined feed and records the unjoined runtime drop.
    ///
    /// Reaching here with a feed still owned means nobody joined it. No owner receives its result.
    /// The warning names the generation it belonged to. This path asks the task to stop but
    /// never aborts it. Dropping Tokio's [`JoinHandle`] detaches the runner, which keeps the
    /// store pool and generation files alive until it finishes in the background.
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
