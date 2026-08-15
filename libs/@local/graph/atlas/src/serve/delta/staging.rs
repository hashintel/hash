//! The staging arm walking classified arrivals toward a placeable embedding.
//!
//! [`StagingArm`] is a long-lived task beside the poll arm, built when serving starts. The poll
//! arm owns the feed fold and withdrawal publication, and this arm owns the arrivals pipeline:
//! each cycle it mirrors the published snapshot's staged arrivals, batch-reads their stored
//! embeddings, and walks each arrival's retry state. The poll arm and this arm share the
//! published [`DeltaCell`] alone, so a stalled ensure or a slow embedding read degrades arrival
//! freshness and nothing else - withdrawal publication continues however long a staging cycle
//! runs.
//!
//! One arrival's phases, and every move between them:
//!
//! ```text
//! enter - the published staged set names a fresh identity
//!   |
//!   v
//! Reading ------ a granted ensure after the ------> Ensured
//!   |            spent reading budget                 |    \
//!   |                                                 |     \   the spent post-ensure budget
//!   |<----- the embedding read answers, either side --+      \
//!   v                                                         '--> Exhausted
//! Ready, display pending                                           (reconciliation or refit)
//!   |
//!   |   the display read answers
//!   v
//! Ready, display captured
//!   |
//!   +---- an in-frame projection the publisher accepts ----> Placed
//!   |
//!   +---- an out-of-frame or non-finite projection --------> Held (until refit)
//!
//! leave - an identity the staged set stops naming drops from any phase
//! ```
//!
//! The pipeline restates the accepted embedding-retry contract, whose one observable is the
//! store read. Entity insert and patch commit before their embedding workflow starts, and the
//! worker writes the embeddings table without a second feed event, so the indexed read is what
//! notices the write. A pending arrival reads for [`DeltaPolling::retry_polls`] consecutive
//! cycles. The cycle that spends the reading budget submits a deduplicated ensure, only after
//! its own read missed - the contract's final read before creating any work. The ensure names
//! the workflow by identity plus edition, the Temporal server's refusal of a concurrent
//! duplicate start is the deduplication, and an already-started refusal counts as a successful
//! ensure. After the ensure, the read continues for the same budget again, and pending ends at a
//! returned row or at exhaustion, never at workflow terminality. A start is not completion. An
//! already-started refusal returns no run to await, so terminality is unobservable by
//! construction.
//!
//! Every failure fails closed and stays pending. A failed ensure start logs and retries at the
//! next cycle. A deployment with no Temporal client stages arrivals and never ensures. An
//! exhausted arrival logs and stays unplaced until reconciliation or refit, the feed contract's
//! own disposition for its losses, and an embedding written after exhaustion reads the same way
//! until the refit repairs it.
//!
//! The pipeline mirrors the published staged set. An identity that leaves it - a withdrawal -
//! drops its pipeline state, and an identity that returns - an unarchive without a frozen
//! placement - re-enters pending with a fresh budget. A pending arrival's edition tracks the
//! newest feed edition, so an ensure always names the current one.
//!
//! A completed arrival places in the same cycle. The arm projects every ready embedding through
//! the generation's own publish path ([`Placer`]) and hands each in-frame coordinate to the poll
//! arm's publisher over the placement channel, keeping the register's single writer. An
//! out-of-frame or non-finite projection parks the arrival under a warning until a refit
//! recalibrates the frame, and a serving process without a placer - a baseline-placed
//! generation, the one shape that serves without one - stages arrivals forever.

use alloc::sync::Arc;
use core::fmt;
use std::collections::HashMap;

use error_stack::Report;
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_postgres_store::store::{AsClient, PostgresStorePool, error::StoreError};
use hash_graph_store::pool::StorePool as _;
use hash_temporal_client::TemporalClient;
use hashql_core::collections::{FastHashMap, FastHashMapEntry, fast_hash_map, fast_hash_set};
use tokio::{sync::mpsc::UnboundedSender, time::MissedTickBehavior};
use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityId},
    ontology::id::BaseUrl,
    principal::actor::ActorEntityUuid,
};

use super::{
    DeltaCell, FrozenPlacement,
    consumer::DeltaPolling,
    placement::{NonFiniteProjection, Placer, Projection},
};
use crate::{
    dataset::{
        PROJECTOR_DIMENSIONS,
        postgres::{
            EditionDisplay, PostgresDatasetError, id::ArchivedEntityId, read_edition_displays,
            read_projector_embeddings,
        },
    },
    math::BoxedVecN,
};

/// The client half of the deduplicated embedding ensure.
///
/// A deployment with no Temporal client configured builds no value of this type: its arrivals
/// stage and never ensure, which fails closed.
#[derive(Debug)]
pub struct EmbeddingEnsure {
    /// The client the ensure starts workflows through.
    pub temporal: TemporalClient,
    /// The property exclusions every ensured workflow receives.
    ///
    /// The exclusions match the store's own workflow starts, read from the same
    /// filter-protection configuration, because an ensure without them would embed protected
    /// properties.
    pub exclusions: HashMap<BaseUrl, Vec<BaseUrl>>,
}

/// One pending arrival's position in the retry contract.
#[derive(Debug)]
enum Phase {
    /// The embedding read has this many cycles left before the ensure submits.
    ///
    /// Zero means the reading budget ran out without a successful ensure, so every further
    /// missed read submits it again.
    Reading {
        /// The pre-ensure read cycles remaining.
        reads_left: u32,
    },
    /// The ensure succeeded, and the read has this many cycles left before exhaustion.
    Ensured {
        /// The post-ensure read cycles remaining.
        reads_left: u32,
    },
    /// The read returned a row, and the embedding awaits placement.
    Ready {
        /// The stored whole-entity embedding's l2-normalized projector prefix.
        embedding: BoxedVecN<PROJECTOR_DIMENSIONS>,
        /// The display payload captured for the recorded edition, absent until its read answers.
        ///
        /// Placement waits for the capture, so a placed arrival always carries the label and
        /// first type its store row stated at the hand-off.
        display: Option<EditionDisplay>,
    },
    /// The publisher holds the placement, and the published staged set retires the entry.
    Placed,
    /// The embedding projects outside the frozen world frame, and the arrival stays unplaced
    /// until a refit recalibrates the frame.
    Held,
    /// Both budgets ran out, and the arrival stays unplaced until reconciliation or refit.
    Exhausted,
}

/// One staged arrival's pipeline state.
#[derive(Debug)]
struct StagingEntry {
    /// The arrival's newest feed edition, the ensure's deduplication component.
    edition: EntityEditionId,
    /// The arrival's position in the retry contract.
    phase: Phase,
}

/// What one missed read obliges for its arrival.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum MissAction {
    /// A budget still stands, and the next cycle reads again.
    Wait,
    /// The reading budget ran out, so the arm submits the deduplicated ensure for the carried
    /// edition.
    Ensure(EntityEditionId),
    /// The post-ensure budget ran out, and the arrival parks until reconciliation or refit.
    Park,
}

/// The retry state per staged arrival, mirroring the published staged set.
#[derive(Debug)]
pub(super) struct StagingPipeline {
    /// The per-side retry budget, in cycles.
    budget: u32,
    /// The pipeline state per staged identity.
    entries: FastHashMap<ArchivedEntityId, StagingEntry>,
}

impl StagingPipeline {
    /// Builds an empty pipeline with `budget` read cycles on each side of the ensure.
    pub(super) fn new(budget: u32) -> Self {
        Self {
            budget,
            entries: fast_hash_map(),
        }
    }

    /// Mirrors the published staged set into the pipeline.
    ///
    /// A fresh identity enters pending with the full reading budget. An identity absent from
    /// `staged` - a withdrawal - drops with its state, so an unarchived identity re-enters
    /// pending from the start. A held identity keeps its phase while its edition tracks the
    /// newest feed edition, so an ensure always names the current one.
    pub(super) fn sync(&mut self, staged: &FastHashMap<ArchivedEntityId, EntityEditionId>) {
        self.entries
            .retain(|identity, _| staged.contains_key(identity));

        for (&identity, &edition) in staged {
            match self.entries.entry(identity) {
                FastHashMapEntry::Vacant(slot) => {
                    slot.insert(StagingEntry {
                        edition,
                        phase: Phase::Reading {
                            reads_left: self.budget,
                        },
                    });
                }
                FastHashMapEntry::Occupied(mut slot) => {
                    slot.get_mut().edition = edition;
                }
            }
        }
    }

    /// Lists every arrival whose next read is due, pre-ensure and post-ensure alike.
    pub(super) fn pending(&self) -> Vec<ArchivedEntityId> {
        self.entries
            .iter()
            .filter(|&(_, entry)| {
                matches!(entry.phase, Phase::Reading { .. } | Phase::Ensured { .. })
            })
            .map(|(&identity, _)| identity)
            .collect()
    }

    /// Completes one arrival: the read returned its row, and the embedding awaits placement.
    ///
    /// A completion for an identity the pipeline holds nothing pending for changes nothing, so a
    /// row racing a withdrawal drops rather than resurrects.
    pub(super) fn complete(
        &mut self,
        identity: ArchivedEntityId,
        embedding: BoxedVecN<PROJECTOR_DIMENSIONS>,
    ) {
        if let Some(entry) = self.entries.get_mut(&identity)
            && matches!(entry.phase, Phase::Reading { .. } | Phase::Ensured { .. })
        {
            entry.phase = Phase::Ready {
                embedding,
                display: None,
            };
        }
    }

    /// Lists the completed arrivals lacking a captured display, keyed to their recorded editions.
    pub(super) fn uncaptured(&self) -> Vec<(ArchivedEntityId, EntityEditionId)> {
        self.entries
            .iter()
            .filter(|&(_, entry)| matches!(entry.phase, Phase::Ready { display: None, .. }))
            .map(|(&identity, entry)| (identity, entry.edition))
            .collect()
    }

    /// Records one completed arrival's captured display.
    ///
    /// A capture for an identity not awaiting one changes nothing, so an answer racing a
    /// withdrawal drops rather than resurrects.
    pub(super) fn captured(&mut self, identity: ArchivedEntityId, payload: EditionDisplay) {
        if let Some(entry) = self.entries.get_mut(&identity)
            && let Phase::Ready { display, .. } = &mut entry.phase
            && display.is_none()
        {
            *display = Some(payload);
        }
    }

    /// Records one missed read, returning what the miss obliges.
    ///
    /// A miss inside a budget waits for the next cycle. The miss that spends the reading budget
    /// obliges the ensure, and every later miss without a successful ensure obliges it again, so
    /// a failed start retries each cycle. The miss that spends the post-ensure budget parks the
    /// arrival. A miss for an identity not pending changes nothing and waits.
    pub(super) fn miss(&mut self, identity: ArchivedEntityId) -> MissAction {
        let Some(entry) = self.entries.get_mut(&identity) else {
            return MissAction::Wait;
        };

        match &mut entry.phase {
            Phase::Reading { reads_left } => {
                *reads_left = reads_left.saturating_sub(1);
                if *reads_left == 0 {
                    MissAction::Ensure(entry.edition)
                } else {
                    MissAction::Wait
                }
            }
            Phase::Ensured { reads_left } => {
                *reads_left = reads_left.saturating_sub(1);
                if *reads_left == 0 {
                    entry.phase = Phase::Exhausted;
                    MissAction::Park
                } else {
                    MissAction::Wait
                }
            }
            Phase::Ready { .. } | Phase::Placed | Phase::Held | Phase::Exhausted => {
                MissAction::Wait
            }
        }
    }

    /// Grants the post-ensure budget after a successful ensure.
    pub(super) fn ensured(&mut self, identity: ArchivedEntityId) {
        if let Some(entry) = self.entries.get_mut(&identity)
            && matches!(entry.phase, Phase::Reading { .. })
        {
            entry.phase = Phase::Ensured {
                reads_left: self.budget,
            };
        }
    }

    /// Lists the completed arrivals holding a captured display, awaiting placement.
    pub(super) fn ready(
        &self,
    ) -> impl Iterator<
        Item = (
            ArchivedEntityId,
            EntityEditionId,
            &BoxedVecN<PROJECTOR_DIMENSIONS>,
            &EditionDisplay,
        ),
    > {
        self.entries
            .iter()
            .filter_map(|(&identity, entry)| match &entry.phase {
                Phase::Ready {
                    embedding,
                    display: Some(display),
                } => Some((identity, entry.edition, embedding, display)),
                Phase::Ready { display: None, .. }
                | Phase::Reading { .. }
                | Phase::Ensured { .. }
                | Phase::Placed
                | Phase::Held
                | Phase::Exhausted => None,
            })
    }

    /// Retires one arrival whose placement the publisher now holds.
    ///
    /// The entry stays until the published staged set stops naming the identity, so a cycle
    /// running between the hand-off and the next publication neither re-reads nor re-places it.
    pub(super) fn placed(&mut self, identity: ArchivedEntityId) {
        if let Some(entry) = self.entries.get_mut(&identity) {
            entry.phase = Phase::Placed;
        }
    }

    /// Parks one arrival whose embedding projects outside the frozen world frame.
    ///
    /// Only a refit moves the frame, so the same embedding projects outside it at every retry
    /// and the arrival stays unplaced until one runs.
    pub(super) fn held(&mut self, identity: ArchivedEntityId) {
        if let Some(entry) = self.entries.get_mut(&identity) {
            entry.phase = Phase::Held;
        }
    }
}

/// One staging cycle failed against the store.
#[derive(Debug)]
pub(crate) enum StagingError {
    /// No connection was available for the cycle.
    Connect(Report<StoreError>),
    /// The embedding read failed or one of its rows did not decode.
    Read(PostgresDatasetError),
}

impl fmt::Display for StagingError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(report) => {
                write!(
                    fmt,
                    "the staging cycle reached no store connection: {report}"
                )
            }
            Self::Read(error) => write!(fmt, "the embedding read failed: {error}"),
        }
    }
}

impl core::error::Error for StagingError {}

/// One ready arrival's owned hand-off key: its identity, edition and captured display.
type PlacementKey = (ArchivedEntityId, EntityEditionId, EditionDisplay);

/// Every row's placement from one projected batch, or the batch's first non-finite row.
type ProjectionOutcome = Result<Vec<Projection>, NonFiniteProjection>;

/// The long-lived task owning one generation's arrivals pipeline.
///
/// One arm serves one generation beside its poll arm. Dropping the task drops the pipeline with
/// it, and a restart rebuilds pending state from the published staged set, so the process keeps
/// no staging state anywhere durable.
#[derive(Debug)]
pub(crate) struct StagingArm {
    /// The store pool the embedding reads and the actor resolution go through.
    pool: Arc<PostgresStorePool>,
    /// The cell carrying the poll arm's publications.
    cell: Arc<DeltaCell>,
    /// The polling knobs, shared with the poll arm.
    polling: DeltaPolling,
    /// The ensure client and its exclusions, or [`None`] to stage without ensuring.
    ensure: Option<EmbeddingEnsure>,
    /// The generation's publish path, or [`None`] for a baseline-placed generation, which
    /// stages without placing.
    placer: Option<Placer>,
    /// The channel carrying frozen placements to the poll arm's publisher.
    placements: UnboundedSender<(ArchivedEntityId, FrozenPlacement)>,
    /// The retry state per staged arrival.
    pipeline: StagingPipeline,
    /// The resolved ensure actor, cached at first use.
    actor: Option<ActorEntityUuid>,
}

impl StagingArm {
    /// Builds the arm over the cell the poll arm publishes into.
    ///
    /// `placements` carries every frozen placement to the poll arm's publisher, and `placer`
    /// being [`None`] stages arrivals without ever placing them, the fail-closed disposition its
    /// construction already logged.
    pub(crate) fn new(
        pool: Arc<PostgresStorePool>,
        cell: Arc<DeltaCell>,
        polling: DeltaPolling,
        ensure: Option<EmbeddingEnsure>,
        placer: Option<Placer>,
        placements: UnboundedSender<(ArchivedEntityId, FrozenPlacement)>,
    ) -> Self {
        let pipeline = StagingPipeline::new(polling.retry_polls);
        Self {
            pool,
            cell,
            polling,
            ensure,
            placer,
            placements,
            pipeline,
            actor: None,
        }
    }

    /// Cycles until the owner drops the task.
    ///
    /// One tick per [`DeltaPolling::interval`], and a cycle running past its tick delays the
    /// next rather than bursting to catch up. A failed cycle moves no budget, and the next tick
    /// retries every pending arrival.
    pub(crate) async fn run(mut self) -> ! {
        let mut ticks = tokio::time::interval(self.polling.interval);
        ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            ticks.tick().await;

            if let Err(error) = self.cycle().await {
                tracing::warn!(%error, "a staging cycle failed, pending arrivals retry next cycle");
            }
        }
    }

    /// Runs one staging cycle.
    ///
    /// A cycle mirrors the published staged set into the pipeline and reads every pending
    /// arrival's embedding in one batch. Each miss then walks its retry state.
    ///
    /// # Errors
    ///
    /// Returns [`StagingError::Connect`] when no connection was available for the cycle, and
    /// [`StagingError::Read`] when the embedding read failed or one of its rows did not decode.
    /// Neither failure moves a budget, because a budget counts reads the store answered rather
    /// than cycles the infrastructure lost.
    async fn cycle(&mut self) -> Result<(), StagingError> {
        {
            let guard = self.cell.load();
            let Some(snapshot) = guard.as_deref() else {
                return Ok(());
            };
            self.pipeline.sync(snapshot.staged_arrivals());
        }

        let pending = self.pipeline.pending();
        if !pending.is_empty() || !self.pipeline.uncaptured().is_empty() {
            let mut store = self
                .pool
                .acquire(None)
                .await
                .map_err(|report| StagingError::Connect(report.change_context(StoreError)))?;

            if !pending.is_empty() {
                let answers = read_projector_embeddings(&store, pending.iter().copied())
                    .await
                    .map_err(StagingError::Read)?;

                let mut answered = fast_hash_set();
                for (identity, embedding) in answers {
                    answered.insert(identity);
                    self.pipeline.complete(identity, embedding);
                }

                for identity in pending {
                    if answered.contains(&identity) {
                        continue;
                    }

                    match self.pipeline.miss(identity) {
                        MissAction::Wait => {}
                        MissAction::Ensure(edition) => {
                            self.submit_ensure(&mut store, identity, edition).await;
                        }
                        MissAction::Park => tracing::warn!(
                            ?identity,
                            "an arrival's retry budget ran out, it stays unplaced until \
                             reconciliation or refit"
                        ),
                    }
                }
            }

            // The capture runs after the completions, so an arrival that became ready this
            // cycle captures and places in the same cycle.
            self.capture_displays(&store).await;
        }

        self.place_ready();

        Ok(())
    }

    /// Captures the display payload of every completed arrival that lacks one.
    ///
    /// One batched read keyed by recorded edition, on the cycle's held connection. Failure
    /// changes nothing beyond a warning: the arrivals stay uncaptured and their placements
    /// defer to the next cycle's retry, so a failed capture degrades arrival freshness and
    /// nothing else.
    async fn capture_displays(&mut self, store: &impl AsClient) {
        let uncaptured = self.pipeline.uncaptured();
        if uncaptured.is_empty() {
            return;
        }

        let answers = match read_edition_displays(
            store,
            uncaptured.iter().map(|&(_, edition)| edition),
        )
        .await
        {
            Ok(answers) => answers,
            Err(error) => {
                tracing::warn!(
                    %error,
                    arrivals = uncaptured.len(),
                    "the display read failed, uncaptured arrivals defer placement to the \
                     next cycle"
                );
                return;
            }
        };

        // The statement answers every requested edition exactly once, so a count below the
        // request count is a broken store invariant rather than a lookup miss.
        if answers.len() != uncaptured.len() {
            tracing::warn!(
                answers = answers.len(),
                requests = uncaptured.len(),
                "the display read answered a different edition count than the request named"
            );
        }

        let by_edition: FastHashMap<EntityEditionId, EditionDisplay> =
            answers.into_iter().collect();
        for (identity, edition) in uncaptured {
            if let Some(display) = by_edition.get(&edition) {
                self.pipeline.captured(identity, display.clone());
            }
        }
    }

    /// Projects every ready arrival and hands each placement to the publisher.
    ///
    /// Placement is one batched projection through the publish path. An in-frame coordinate
    /// travels the placement channel and retires its pipeline entry, an out-of-frame coordinate
    /// parks the arrival until refit, and a non-finite projection parks its own row while the
    /// rows behind it retry at the next cycle. A closed channel leaves every entry ready, so the
    /// next cycle retries the hand-off.
    fn place_ready(&mut self) {
        let Some((keyed, outcome)) = self.project_ready() else {
            return;
        };

        match outcome {
            Ok(projections) => {
                for ((identity, edition, display), projection) in keyed.into_iter().zip(projections)
                {
                    match projection {
                        Projection::Placed { wire } => {
                            if self
                                .placements
                                .send((
                                    identity,
                                    FrozenPlacement {
                                        edition,
                                        wire,
                                        display,
                                    },
                                ))
                                .is_err()
                            {
                                tracing::warn!(
                                    "the placement channel closed, placements retry next cycle"
                                );
                                return;
                            }
                            self.pipeline.placed(identity);
                        }
                        Projection::OutOfFrame { world } => {
                            tracing::warn!(
                                ?identity,
                                ?world,
                                "an arrival projects outside the frozen world frame, it stays \
                                 unplaced until a refit recalibrates the frame"
                            );
                            self.pipeline.held(identity);
                        }
                    }
                }
            }
            Err(failure) => {
                let (identity, _, _) = keyed[failure.row];
                tracing::warn!(
                    ?identity,
                    "an arrival's projection is non-finite, it stays unplaced until a refit"
                );
                self.pipeline.held(identity);
            }
        }
    }

    /// Projects the ready batch through the publish path, keyed for the hand-off.
    ///
    /// The keys own their identity, edition and display, so the caller walks the outcome while
    /// mutating the pipeline. [`None`] means the arm holds no placer or nothing is ready.
    fn project_ready(&self) -> Option<(Vec<PlacementKey>, ProjectionOutcome)> {
        let placer = self.placer.as_ref()?;

        let batch: Vec<_> = self.pipeline.ready().collect();
        if batch.is_empty() {
            return None;
        }

        let keyed = batch
            .iter()
            .map(|&(identity, edition, _, display)| (identity, edition, display.clone()))
            .collect();
        let outcome = placer.project(batch.iter().map(|&(_, _, embedding, _)| embedding));

        Some((keyed, outcome))
    }

    /// Submits the deduplicated ensure for one arrival whose reading budget ran out.
    ///
    /// Every failure leaves the arrival pending. A missing Temporal client never ensures. An
    /// unresolved actor and a failed start both log, and the next cycle retries them. A
    /// successful start and an already-started refusal both grant the post-ensure budget.
    async fn submit_ensure(
        &mut self,
        store: &mut impl PrincipalStore,
        identity: ArchivedEntityId,
        edition: EntityEditionId,
    ) {
        let Some(ensure) = &self.ensure else {
            return;
        };

        let actor = match self.actor {
            Some(actor) => actor,
            None => match store.get_or_create_system_machine("h").await {
                Ok(machine) => {
                    let actor = ActorEntityUuid::from(machine);
                    self.actor = Some(actor);
                    actor
                }
                Err(error) => {
                    tracing::warn!(
                        %error,
                        ?identity,
                        "the ensure actor did not resolve, the arrival stays pending"
                    );
                    return;
                }
            },
        };

        let entity = EntityId::from(identity);
        let workflow_id = format!("atlas-embedding-{entity}-{}", edition.as_uuid());
        match ensure
            .temporal
            .ensure_update_entity_embeddings_workflow(
                workflow_id,
                actor,
                entity,
                &ensure.exclusions,
            )
            .await
        {
            Ok(start) => {
                tracing::debug!(?identity, ?start, "the embedding ensure is in flight");
                self.pipeline.ensured(identity);
            }
            Err(error) => {
                tracing::warn!(
                    %error,
                    ?identity,
                    "the embedding ensure did not start, the arrival stays pending"
                );
            }
        }
    }
}
