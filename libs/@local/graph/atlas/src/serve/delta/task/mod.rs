//! Owned feed execution and immutable request publications.
//!
//! [`DeltaTask`] drives feed reads, placement and publication together. Change notifications are
//! wake-ups rather than a publication queue. Changes accumulated before an exchange appear in one
//! publication. [`DeltaReader`] captures the last exchanged value independently of the
//! runner's lifetime.

use alloc::sync::Arc;
use core::{error::Error, fmt, future::Future};

use arc_swap::ArcSwap;
use error_stack::{Report, ReportSink, ResultExt as _};
use futures::FutureExt as _;
use hash_graph_postgres_store::store::PostgresStorePool;
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use tokio::{sync::mpsc, task::JoinSet};

use super::{
    Delta,
    epoch::Epoch,
    feed::{self, DeltaFeedTask, DeltaFeedTaskOptions, Publication},
    placement::{
        Completed, DeltaPlacementTask, DeltaPlacementTaskOptions, EmbeddingWorkflow, Initial,
        PendingEntry,
    },
    projector::DeltaProjector,
};
use crate::device::PhysicalDevice;

#[cfg(test)]
mod tests;

/// Polling and placement limits for one generation's feed.
#[derive(Copy, Clone)]
pub(crate) struct DeltaTaskOptions {
    /// Event polling and replay settings.
    pub feed: DeltaFeedTaskOptions,
    /// Embedding lookup, projection and admission settings.
    pub placement: DeltaPlacementTaskOptions,
}

/// A failure opening or running a generation's feed.
#[derive(Debug)]
pub(crate) enum DeltaTaskError {
    /// Opening the generation's projector failed.
    Projector,
    /// Initializing or running event replay failed.
    Feed,
    /// Initializing or running embedding placement failed.
    Placement,
    /// Exchanging immutable publications failed.
    Publication,
    /// Joining a spawned feed, placement or publication task failed.
    Panic,
}

impl fmt::Display for DeltaTaskError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Projector => fmt.write_str("could not open the generation's projector"),
            Self::Feed => fmt.write_str("the entity feed failed"),
            Self::Placement => fmt.write_str("the placement task failed"),
            Self::Publication => fmt.write_str("the publication task failed"),
            Self::Panic => fmt.write_str("the task panicked"),
        }
    }
}

impl Error for DeltaTaskError {}

/// A request-side handle to the latest coherent publication.
///
/// The handle exposes the supplied delta until replay exchanges a replacement and retains the last
/// exchanged publication after shutdown. Coherence means one immutable delta revision, not that
/// replay is healthy or caught up with the store.
#[derive(Clone)]
pub(crate) struct DeltaReader {
    current: Arc<ArcSwap<Delta>>,
}

impl DeltaReader {
    /// Captures one publication for all of a request's component lookups.
    ///
    /// A later exchange changes what subsequent loads capture without changing the returned
    /// [`Epoch`].
    pub(crate) fn load(&self) -> Epoch {
        Epoch::from(self.current.load())
    }
}

impl From<Delta> for DeltaReader {
    fn from(delta: Delta) -> Self {
        Self {
            current: Arc::new(ArcSwap::from_pointee(delta)),
        }
    }
}

/// A generation's placement worker and its request/completion channels.
struct Placement {
    task: DeltaPlacementTask,
    projector: DeltaProjector,
    requests: mpsc::Receiver<PendingEntry<Initial>>,
    completed: mpsc::Sender<PendingEntry<Completed>>,
}

/// One generation's feed, placement worker and publication loop.
///
/// Opening starts no background tasks. The owner polls [`Self::run`] and observes its result.
/// The reader can outlive the runner without keeping its database or placement work active.
pub(crate) struct DeltaTask {
    feed: DeltaFeedTask,
    publication: Publication,
    placement: Option<Placement>,

    current: Arc<ArcSwap<Delta>>,
    previous: Arc<Delta>,
}

impl DeltaTask {
    /// Opens temporal replay for a generation and returns its request reader.
    ///
    /// A generation without temporal axes returns a static reader without opening the projector or
    /// validating task options. For a temporal generation, projector opening reads its checkpoint
    /// and validates its roundtrip sample synchronously. Without a checkpoint, the feed still
    /// processes withdrawals and metadata while new node placements remain pending.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaTaskError`] when projector opening or task construction fails. Projector
    /// opening precedes construction. With a projector, placement validation precedes feed
    /// validation. Without one, only feed validation runs.
    ///
    /// # Panics
    ///
    /// Panics if initialization reaches placement-channel construction with
    /// [`DeltaPlacementTaskOptions::max_pending`] greater than
    /// [`tokio::sync::Semaphore::MAX_PERMITS`]. Generations without temporal axes or a projector do
    /// not construct these channels.
    ///
    /// With temporal axes, feed construction also has [`DeltaFeedTask::new`]'s
    /// unit-revision-increment panic condition.
    pub(crate) fn open(
        delta: Delta,
        pool: Arc<PostgresStorePool>,
        options: DeltaTaskOptions,
        device: PhysicalDevice,
        workflow: Option<Arc<EmbeddingWorkflow>>,
    ) -> Result<(DeltaReader, Option<Self>), Report<DeltaTaskError>> {
        let generation = delta.world.generation();
        let Some(axes) = generation.repository().metadata.snapshot.axes else {
            return Ok((DeltaReader::from(delta), None));
        };

        let projector =
            DeltaProjector::open(generation, device).change_context(DeltaTaskError::Projector)?;

        let task = Self::new(
            delta,
            pool,
            axes.transaction_time,
            projector,
            workflow,
            options,
        )?;

        Ok((task.reader(), Some(task)))
    }

    /// Wires the feed, an optional placement worker and their publication loop together.
    ///
    /// Without a `projector`, placement channels are absent and new node placements remain
    /// pending on the feed.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaTaskError`] when task initialization fails. With a `projector`, placement
    /// validation precedes feed validation. Without one, only feed validation runs.
    ///
    /// # Panics
    ///
    /// With a projector and a nonzero placement polling interval, panics when
    /// [`DeltaPlacementTaskOptions::max_pending`] exceeds [`tokio::sync::Semaphore::MAX_PERMITS`].
    ///
    /// Feed construction also has [`DeltaFeedTask::new`]'s unit-revision-increment panic condition.
    fn new(
        delta: Delta,
        pool: Arc<PostgresStorePool>,
        watermark: Timestamp<TransactionTime>,
        projector: Option<DeltaProjector>,
        workflow: Option<Arc<EmbeddingWorkflow>>,
        options: DeltaTaskOptions,
    ) -> Result<Self, Report<DeltaTaskError>> {
        let (placement, channels) = if let Some(projector) = projector {
            let capacity = options.placement.max_pending.get();
            let task = DeltaPlacementTask::new(Arc::clone(&pool), options.placement, workflow)
                .change_context(DeltaTaskError::Placement)?;

            let (request_tx, request_rx) = mpsc::channel(capacity);
            let (complete_tx, complete_rx) = mpsc::channel(capacity);

            (
                Some(Placement {
                    task,
                    projector,
                    requests: request_rx,
                    completed: complete_tx,
                }),
                Some(feed::Placement {
                    requests: request_tx,
                    completed: complete_rx,
                }),
            )
        } else {
            (None, None)
        };

        let current = Arc::new(ArcSwap::from_pointee(delta.clone()));
        let previous = current.load_full();

        let (feed, publication) =
            DeltaFeedTask::new(delta, pool, options.feed, watermark, channels)
                .change_context(DeltaTaskError::Feed)?;

        Ok(Self {
            feed,
            publication,
            placement,
            current,
            previous,
        })
    }

    /// Returns a reader sharing this task's publication point.
    pub(crate) fn reader(&self) -> DeltaReader {
        DeltaReader {
            current: Arc::clone(&self.current),
        }
    }

    /// Runs the task chain until its channels close, joining every child before returning.
    ///
    /// The generation owner supplies `shutdown`, such as a cancellation token's owned future. The
    /// selection order prioritizes shutdown over the next publication: it preserves the value
    /// already visible through [`DeltaReader`] but does not force unpublished working changes into
    /// that reader.
    /// Closing the publication exchange propagates closure through the feed and placement
    /// channels. An operation already selected by either task reaches its next channel check before
    /// exiting. This method joins every child.
    ///
    /// Captured epochs and readers remain valid after shutdown. Dropping this future before its
    /// first poll starts no child. After the first poll, dropping it drops the Tokio [`JoinSet`]
    /// and aborts its asynchronous children without joining them, but cannot cancel projection
    /// work already submitted to Rayon, which runs to completion and drops the result its
    /// receiver no longer accepts.
    ///
    /// # Errors
    ///
    /// Collects feed, publication and placement failures under the corresponding
    /// [`DeltaTaskError`] variants, including failures concurrent with shutdown. A child join
    /// failure reports [`DeltaTaskError::Panic`]. Requested shutdown does not itself produce an
    /// error.
    ///
    /// # Panics
    ///
    /// Panics when polled outside a Tokio runtime while `shutdown` remains pending.
    #[tracing::instrument(skip_all, err(Debug))]
    pub(crate) async fn run(
        self,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> Result<(), Report<[DeltaTaskError]>> {
        let mut shutdown = Box::pin(shutdown);
        if shutdown.as_mut().now_or_never().is_some() {
            return Ok(());
        }

        let Self {
            feed,
            publication,
            placement,
            current,
            previous,
        } = self;

        let mut join = JoinSet::new();

        join.spawn(async move { feed.run().await.change_context(DeltaTaskError::Feed) });
        join.spawn(async move {
            publication
                .run(current, previous, shutdown)
                .await
                .change_context(DeltaTaskError::Publication)
        });

        if let Some(placement) = placement {
            join.spawn(async move {
                placement
                    .task
                    .run(placement.projector, placement.requests, placement.completed)
                    .await
                    .change_context(DeltaTaskError::Placement)
            });
        }

        let mut sink = ReportSink::new();
        while let Some(result) = join.join_next().await {
            sink.attempt(result.change_context(DeltaTaskError::Panic).flatten());
        }
        sink.finish()
    }
}
