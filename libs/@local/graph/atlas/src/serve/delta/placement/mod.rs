//! Embedding retries and owned projection batches for incoming events.
//!
//! [`DeltaPlacementTask`] keeps database and workflow operations on Tokio. A failed store lookup
//! preserves that stage's embedding-miss budget for a later tick, while a successful miss spends
//! it. An unavailable workflow actor, a failed workflow start or a per-row projection error
//! completes the affected event with a terminal placement error. Each projection job owns the
//! model, scratch storage and input batch on Rayon until it returns them.

mod pending;

use alloc::sync::Arc;
use core::{
    error::Error, fmt, future::Future, num::NonZero, ops::ControlFlow, panic::AssertUnwindSafe,
    time::Duration,
};
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_postgres_store::store::{AsClient, PostgresStorePool};
use hash_graph_store::pool::StorePool as _;
use hash_temporal_client::TemporalClient;
use hashql_core::{collections::FastHashMap, id::Id as _};
use tokio::{sync::mpsc, time::Interval};
use type_system::{ontology::id::BaseUrl, principal::actor::ActorId};

use self::pending::{Pending, PollWorkflow, Project};
use super::projector::DeltaProjector;
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::BoxedVecN,
    postgres::{id::ArchivedEntityId, read_projector_embeddings},
};

#[cfg(test)]
mod tests;

pub(crate) use self::pending::{Completed, Initial, PendingEntry};

/// The workflow client and property exclusions used to produce missing embeddings.
#[derive(Debug)]
pub struct EmbeddingWorkflow {
    /// The client used to start or find each entity's embedding workflow.
    pub temporal: TemporalClient,
    /// The per-base-URL exclusions supplied to the embedding workflow.
    pub exclusions: HashMap<BaseUrl, Vec<BaseUrl>>,
}

/// A failed event placement.
#[derive(Debug)]
pub(crate) enum PlacementError {
    /// The configured reads found no embedding, or workflow submission is unavailable.
    Exhaustion,
    /// Starting the embedding workflow failed.
    Workflow,
    /// Projecting the embedding failed.
    Projection,
}

impl fmt::Display for PlacementError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Exhaustion => fmt.write_str("the embedding lookup budget ran out"),
            Self::Workflow => fmt.write_str("could not start the embedding workflow"),
            Self::Projection => fmt.write_str("could not project the embedding"),
        }
    }
}

impl Error for PlacementError {}

/// A placement task configuration or execution failure.
#[derive(Debug)]
pub(crate) enum DeltaPlacementError {
    /// The polling interval is zero.
    InvalidInterval,
    /// Acquiring a store connection failed.
    Connect,
    /// Reading the projector embeddings failed.
    Read,
    /// The projection worker panicked or disappeared without returning its owned state.
    Offload,
}

impl fmt::Display for DeltaPlacementError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInterval => {
                fmt.write_str("the placement polling interval must be non-zero")
            }
            Self::Connect => fmt.write_str("could not connect to the store"),
            Self::Read => fmt.write_str("could not read the projector embeddings"),
            Self::Offload => fmt.write_str("the projection worker failed"),
        }
    }
}

impl Error for DeltaPlacementError {}

/// Polling cadence and bounds supplied by the placement task's owner.
#[derive(Copy, Clone)]
pub(crate) struct DeltaPlacementTaskOptions {
    /// How often the task polls for embeddings and re-evaluates pending work.
    pub tick_rate: Duration,
    /// Workflow-embedding misses allowed before an entry exhausts.
    ///
    /// A lookup still runs at zero: a hit succeeds, while a miss exhausts the entry.
    pub tries_workflow: u16,
    /// Database-embedding misses allowed before an entry submits a workflow.
    ///
    /// A lookup still runs at zero: a hit succeeds, while a miss advances to submission.
    pub tries_database: u16,
    /// Minimum ticks between non-empty projection batches.
    ///
    /// The previous batch's tick plus this interval must fit `usize` for the spacing comparison to
    /// preserve this bound.
    pub minimum_projection_interval: usize,
    /// Maximum admitted events, including results awaiting delivery.
    pub max_pending: NonZero<usize>,
}

/// Reused embedding-lookup results for one poll.
#[derive(Default)]
struct Scratch {
    embeddings: FastHashMap<ArchivedEntityId, BoxedVecN<PROJECTOR_DIMENSIONS>>,
}

hashql_core::id::newtype! {
    /// A placement task's own tick counter, used to space projection batches.
    ///
    /// Unit increments and spacing sums convert the stored value to `usize` before addition. A 32-bit target discards upper bits during that conversion.
    ///
    /// # Warning
    ///
    /// Without overflow checking, overflowing additions wrap. Repeated counter values or wrapped spacing thresholds can violate the minimum interval between projection batches.
    struct Tick(u64)
}

/// One generation's embedding polling and projection task.
pub(crate) struct DeltaPlacementTask {
    pool: Arc<PostgresStorePool>,
    tick: Tick,
    options: DeltaPlacementTaskOptions,
    actor: Option<ControlFlow<(), ActorId>>,
    pending: Pending,
    scratch: Scratch,
    workflow: Option<Arc<EmbeddingWorkflow>>,
    last_projection_at: Option<Tick>,
}

impl DeltaPlacementTask {
    /// Builds a task with bounded admission and no cached actor.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaPlacementError::InvalidInterval`] for a zero polling interval.
    pub(crate) fn new(
        pool: Arc<PostgresStorePool>,
        options: DeltaPlacementTaskOptions,
        workflow: Option<Arc<EmbeddingWorkflow>>,
    ) -> Result<Self, Report<DeltaPlacementError>> {
        if options.tick_rate.is_zero() {
            return Err(Report::new(DeltaPlacementError::InvalidInterval));
        }

        Ok(Self {
            pool,
            tick: Tick::new(0),
            options,
            actor: None,
            pending: Pending::default(),
            scratch: Scratch::default(),
            workflow,
            last_projection_at: None,
        })
    }

    /// Drains accepted requests after input closure, or stops when the result receiver closes.
    ///
    /// Results retain their event IDs and use fitted-world coordinates. A store failure retries the
    /// failed lookup stage without spending that stage's miss budget. Stages already completed in
    /// the same poll remain applied. An unavailable actor exhausts workflow submissions. One
    /// projection batch runs at a time.
    ///
    /// Dropping this future cancels its asynchronous polling and delivery. A projection already
    /// submitted to Rayon continues after its result receiver drops. Completion releases the owned
    /// model, scratch storage and undeliverable results.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaPlacementError::Offload`] if the projection worker panics or disappears
    /// without returning its owned state. The task logs and retries store failures. It delivers
    /// workflow and per-row projection failures as [`PlacementError`] values without ending the
    /// task.
    ///
    /// # Panics
    ///
    /// Panics unless polled within a Tokio runtime with time enabled. A sufficiently late tick can
    /// also panic when adding [`DeltaPlacementTaskOptions::tick_rate`] to the current instant would
    /// exceed Tokio's representable deadline. With overflow checking, a unit tick increment at
    /// `usize::MAX` or an evaluated spacing sum above that bound also panics, as
    /// [`Self::projection_due`] describes.
    pub(crate) async fn run(
        mut self,
        mut projector: DeltaProjector,
        mut rx: mpsc::Receiver<PendingEntry<Initial>>,
        tx: mpsc::Sender<PendingEntry<Completed>>,
    ) -> Result<(), Report<DeltaPlacementError>> {
        let mut interval = tokio::time::interval(self.options.tick_rate);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut input_open = true;

        while self
            .wait_for_tick(&mut rx, &tx, &mut input_open, &mut interval)
            .await
            .is_continue()
        {
            self.tick.increment_by(1);
            if let Err(error) = self.poll().await {
                tracing::warn!(?error, "Retry placement polling after a store failure");
            }

            if self.projection_due() {
                let batch = core::mem::take(&mut self.pending.project);
                let (returned, outcomes) = Self::project(projector, batch).await?;
                projector = returned;

                self.pending.completed.extend(outcomes);
                self.last_projection_at = Some(self.tick);
            }

            if self.pending.flush(&tx).is_break() {
                return Ok(());
            }
        }

        Ok(())
    }

    /// Processes placement work until a tick, completion-channel closure or complete input drain.
    ///
    /// Returns [`ControlFlow::Continue`] whenever a tick fires, including while pending work fills
    /// the admission limit. Only input admission observes that limit. A full task can keep polling
    /// and projecting its admitted work. Returns [`ControlFlow::Break`] when the completion channel
    /// closes. After input closure, it also breaks once all pending work drains and the task
    /// delivers every result.
    ///
    /// # Panics
    ///
    /// A late tick can panic if `interval` computes an unrepresentable next deadline.
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "Tokio select uses a remainder to randomize its first branch"
    )]
    async fn wait_for_tick(
        &mut self,
        rx: &mut mpsc::Receiver<PendingEntry<Initial>>,
        tx: &mpsc::Sender<PendingEntry<Completed>>,
        input_open: &mut bool,
        interval: &mut Interval,
    ) -> ControlFlow<()> {
        while *input_open || self.pending.len() > 0 {
            tokio::select! {
                () = tx.closed() => return ControlFlow::Break(()),
                permit = tx.reserve(), if !self.pending.completed.is_empty() => {
                    let Ok(permit) = permit else {
                        return ControlFlow::Break(());
                    };
                    if let Some(completed) = self.pending.completed.pop_front() {
                        permit.send(completed);
                    }
                    if self.pending.flush(tx).is_break() {
                        return ControlFlow::Break(());
                    }
                }
                request = rx.recv(), if *input_open && self.pending.len() < self.options.max_pending.get() => {
                    match request {
                        Some(request) => self.pending.enqueue(request, self.options.tries_database),
                        None => *input_open = false,
                    }
                }
                _ = interval.tick() => return ControlFlow::Continue(()),
            }
        }

        ControlFlow::Break(())
    }

    /// Returns whether a non-empty projection batch is due at the current tick.
    ///
    /// The current tick and the previous projection tick plus
    /// [`DeltaPlacementTaskOptions::minimum_projection_interval`] must fit `usize` for this
    /// comparison to preserve the requested spacing. A first batch needs no spacing comparison.
    ///
    /// # Panics
    ///
    /// With overflow checking, panics when a non-empty pending batch and a previous projection
    /// require a spacing sum above `usize::MAX`.
    fn projection_due(&self) -> bool {
        !self.pending.project.is_empty()
            && self
                .last_projection_at
                .is_none_or(|last| self.tick >= last.plus(self.options.minimum_projection_interval))
    }

    /// Reads `ids`' projector embeddings into `scratch`, clearing it first.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaPlacementError::Read`] if the store read fails.
    async fn fetch_embeddings(
        store: &impl AsClient,
        ids: impl Iterator<Item = ArchivedEntityId>,
        scratch: &mut Scratch,
    ) -> Result<(), Report<DeltaPlacementError>> {
        scratch.embeddings.clear();

        let embeddings = read_projector_embeddings(store, ids)
            .await
            .change_context(DeltaPlacementError::Read)?;
        scratch.embeddings.extend(embeddings);

        Ok(())
    }

    /// Polls outstanding workflow and database lookups, then submits exhausted database entries.
    ///
    /// Returns without connecting to the store when no entry awaits a poll or submission.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaPlacementError::Connect`] or [`DeltaPlacementError::Read`] for a store
    /// failure.
    async fn poll(&mut self) -> Result<(), Report<DeltaPlacementError>> {
        if self.pending.poll_database.is_empty()
            && self.pending.poll_workflow.is_empty()
            && self.pending.submit_workflow.is_empty()
        {
            return Ok(());
        }

        let pool = Arc::clone(&self.pool);
        let mut store = pool
            .acquire(None)
            .await
            .change_context(DeltaPlacementError::Connect)?;

        if !self.pending.poll_workflow.is_empty() {
            Self::fetch_embeddings(
                &store,
                self.pending
                    .poll_workflow
                    .iter()
                    .map(|entry| ArchivedEntityId::from(entry.entity)),
                &mut self.scratch,
            )
            .await?;

            self.pending
                .transition_workflow(&mut self.scratch.embeddings);
        }

        if !self.pending.poll_database.is_empty() {
            Self::fetch_embeddings(
                &store,
                self.pending
                    .poll_database
                    .iter()
                    .map(|entry| ArchivedEntityId::from(entry.entity)),
                &mut self.scratch,
            )
            .await?;

            self.pending
                .transition_database(&mut self.scratch.embeddings);
        }

        self.scratch.embeddings.clear();
        self.submit_workflow(&mut store).await;

        Ok(())
    }

    /// Starts an embedding workflow for entries awaiting submission, resolving the actor lazily.
    ///
    /// An unavailable workflow client or actor exhausts every waiting entry instead of submitting.
    async fn submit_workflow(&mut self, store: &mut impl PrincipalStore) {
        if self.pending.submit_workflow.is_empty() {
            return;
        }

        let Some(workflow) = &self.workflow else {
            self.pending.exhaust_submit_workflow();
            return;
        };

        let ControlFlow::Continue(actor) =
            Self::resolve_actor(&mut self.actor, &mut self.pending, async {
                store
                    .get_or_create_system_machine("h")
                    .await
                    .map(ActorId::from)
            })
            .await
        else {
            return;
        };

        for entry in self.pending.submit_workflow.drain(..) {
            let workflow_id = format!("atlas-embedding-{}", entry.entity);
            let start = workflow
                .temporal
                .ensure_update_entity_embeddings_workflow(
                    workflow_id,
                    actor.into(),
                    entry.entity,
                    &workflow.exclusions,
                )
                .await;

            match start {
                Ok(_) => self
                    .pending
                    .poll_workflow
                    .push(entry.transition(PollWorkflow {
                        tries: self.options.tries_workflow,
                    })),
                Err(error) => self
                    .pending
                    .completed
                    .push_back(entry.transition(Completed(Err(
                        error.change_context(PlacementError::Workflow),
                    )))),
            }
        }
    }

    /// Returns the cached actor lookup outcome, running and caching `lookup` on the first call.
    ///
    /// A failed lookup is cached as [`ControlFlow::Break`] and exhausts `pending`'s waiting
    /// workflow submissions.
    async fn resolve_actor<E: fmt::Debug>(
        cached: &mut Option<ControlFlow<(), ActorId>>,
        pending: &mut Pending,
        lookup: impl Future<Output = Result<ActorId, E>>,
    ) -> ControlFlow<(), ActorId> {
        let actor = if let Some(actor) = *cached {
            actor
        } else {
            let actor = match lookup.await {
                Ok(actor) => ControlFlow::Continue(actor),
                Err(error) => {
                    tracing::warn!(
                        ?error,
                        "Disable embedding workflows after actor lookup failure"
                    );
                    ControlFlow::Break(())
                }
            };

            *cached = Some(actor);
            actor
        };

        if actor.is_break() {
            pending.exhaust_submit_workflow();
        }
        actor
    }

    /// Projects `batch` on a blocking offload thread, returning the projector for reuse.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaPlacementError::Offload`] if the projection worker panics or disappears
    /// without returning, discarding the projector.
    #[tracing::instrument(skip_all, fields(rows = batch.len()))]
    async fn project(
        projector: DeltaProjector,
        batch: Vec<PendingEntry<Project>>,
    ) -> Result<
        (
            DeltaProjector,
            impl ExactSizeIterator<Item = PendingEntry<Completed>>,
        ),
        Report<DeltaPlacementError>,
    > {
        // The job owns the projector and discards it on panic. Partially mutated scratch is never
        // reused.
        let mut projector = AssertUnwindSafe(projector);

        crate::offload::run(move || {
            let results: Vec<_> = projector
                .project(batch.iter().map(|entry| &entry.phase.embedding))
                .collect();

            let completed = batch.into_iter().zip(results).map(|(entry, result)| {
                entry.transition(Completed(result.change_context(PlacementError::Projection)))
            });

            (projector.0, completed)
        })
        .await
        .change_context(DeltaPlacementError::Offload)
    }
}
