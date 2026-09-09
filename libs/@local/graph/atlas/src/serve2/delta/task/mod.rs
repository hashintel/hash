//! Owned feed execution and immutable request publications.
//!
//! [`DeltaTask`] drives feed reads, placement and publication together. [`DeltaReader`] captures
//! the latest publication independently of the runner's lifetime.

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
pub(crate) struct DeltaTaskOptions {
    pub feed: DeltaFeedTaskOptions,
    pub placement: DeltaPlacementTaskOptions,
}

/// A failure opening or running a generation's feed.
#[derive(Debug)]
pub(crate) enum DeltaTaskError {
    Projector,
    Feed,
    Placement,
    Publication,
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

/// A request-side handle to the latest complete publication.
///
/// The handle exposes the supplied delta until a replay publishes a replacement and retains the
/// latest publication after shutdown, without promising feed health or store freshness.
#[derive(Clone)]
pub(crate) struct DeltaReader {
    current: Arc<ArcSwap<Delta>>,
}

impl DeltaReader {
    /// Captures one publication for all of a request's component lookups.
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
    /// Opens the base generation's projector and starts replay at its transaction-time snapshot.
    ///
    /// Returns a reader in every successful case, with no runner for a generation without temporal
    /// axes. Opening a projector reads its checkpoint and validates its roundtrip sample
    /// synchronously. Without a checkpoint, the feed
    /// still processes withdrawals and metadata while new node placements remain pending.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaTaskError::Projector`] when projector opening fails,
    /// [`DeltaTaskError::Feed`] for invalid feed options, or [`DeltaTaskError::Placement`] for
    /// invalid placement options when a projector is present.
    pub(crate) fn open(
        delta: Delta,
        pool: Arc<PostgresStorePool>,
        options: DeltaTaskOptions,
        device: PhysicalDevice,
        workflow: Option<EmbeddingWorkflow>,
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

    fn new(
        delta: Delta,
        pool: Arc<PostgresStorePool>,
        watermark: Timestamp<TransactionTime>,
        projector: Option<DeltaProjector>,
        workflow: Option<EmbeddingWorkflow>,
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

    pub(crate) fn reader(&self) -> DeltaReader {
        DeltaReader {
            current: Arc::clone(&self.current),
        }
    }

    /// Runs the task chain until its channels close, joining every child before returning.
    ///
    /// The generation owner supplies `shutdown`, such as a cancellation token's owned future.
    /// Shutdown ends publication and closes its exchange sender. The feed then closes the
    /// placement channels on exit. In-flight operations finish before their tasks observe closure,
    /// and the owner awaits this runner before releasing the generation.
    ///
    /// Captured epochs and readers remain valid after shutdown. Dropping the runner instead of
    /// awaiting it aborts its children through the join set and does not join them.
    ///
    /// # Errors
    ///
    /// Collects feed, publication and placement failures under the corresponding
    /// [`DeltaTaskError`] variants, including failures concurrent with shutdown. A child panic
    /// reports [`DeltaTaskError::Panic`]. Requested shutdown does not itself produce an error.
    #[tracing::instrument(skip_all, err)]
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
