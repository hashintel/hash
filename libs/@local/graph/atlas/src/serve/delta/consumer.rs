//! The poll arm feeding a generation's delta publications.
//!
//! [`DeltaConsumer`] is the one writer behind a [`DeltaCell`], a long-lived task built beside the
//! cell when serving starts. Each poll reads the entity feed window and folds it into the register,
//! and a fresh snapshot publishes whenever resolution changed. Requests keep loading whatever the
//! cell holds, so a slow or failing poll degrades freshness and nothing else.
//!
//! After the fold, a poll classifies its unclassified arrivals in one batched read at the store's
//! present. The read fails closed. A failed batch logs a warning and stays unclassified in the
//! register, so the next poll retries it, while publication proceeds and the watermark advances,
//! because the watermark tracks folded feed events and the register still holds the identities.
//! A link verdict with an incomplete attachment pair registers no edge under a warning, never
//! falling back to the node pipeline, because the type test already excludes it from the node
//! scope's law. Retries need no budget: the read is one indexed batch per poll with no spend to
//! bound.
//!
//! Each poll also drains the placement channel the staging arm feeds, folding every frozen
//! placement into the register before the publication decision. The consumer stays the register's
//! one writer, and a drained placement publishes at the same poll that received it, so an
//! arrival's coordinate reaches serving within one poll interval of its projection.
//!
//! Each poll reads events after the held watermark minus the safety lag. The lag covers the feed's
//! commit-visibility window. An event becomes visible up to a whole write request after its
//! recorded time, with concurrent writers adding their clock skew on top, so a poll reading only
//! past its newest seen time would miss late commits. The trailing window re-delivers events the
//! register already applied, and the fold ignores them by version. The clock model lives with the
//! feed, [`PostgresStore::entity_events_since`].
//!
//! The first poll is the init replay. Its watermark starts at the fit's own transaction-time point,
//! so the read covers every change the serving generation cannot know about. The replay logs its
//! event count, its duration, and the register's resident-byte estimate - the telemetry that sizes
//! replay against the persistent-store escape.
//!
//! A failed poll publishes nothing and leaves the held snapshot serving. The next tick retries from
//! the same watermark, so an error skips no events.
//!
//! [`PostgresStore::entity_events_since`]: hash_graph_postgres_store::store::PostgresStore::entity_events_since

use alloc::sync::Arc;
use core::{fmt, pin::pin, time::Duration};
use std::time::Instant;

use error_stack::Report;
use futures::TryStreamExt as _;
use hash_graph_postgres_store::store::{
    AsClient, EntityEvent, PostgresStorePool, error::StoreError,
};
use hash_graph_store::{error::QueryError, pool::StorePool as _};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use tokio::{sync::mpsc::UnboundedReceiver, time::MissedTickBehavior};

use super::{
    DeltaCell, DeltaEvent, DeltaRegister, DeltaRevision, Disposition, FrozenPlacement,
    IdentityTables,
};
use crate::{
    dataset::postgres::{Classification, classify_entities, id::ArchivedEntityId},
    serve::codec::Universe,
};

/// The consumer's polling knobs.
///
/// The serve flags read their defaults from here, so the values live in exactly one place and
/// `--help` renders them.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DeltaPolling {
    /// How long the consumer waits between polls.
    ///
    /// [`Self::INTERVAL_SECONDS`] by default.
    pub interval: Duration,
    /// How far behind its own watermark a poll starts reading.
    ///
    /// [`Self::SAFETY_LAG_SECONDS`] by default. The feed's contract requires the lag to exceed the
    /// longest write request plus the largest cross-writer clock skew. Nobody has measured either
    /// bound, so the default stands wide until a measurement revises it downward. Query
    /// affordability cannot establish event completeness, so a tighter lag is an accepted-risk
    /// decision rather than a performance tuning.
    pub safety_lag: time::Duration,
    /// How many consecutive staging cycles read for a pending arrival's embedding on each side
    /// of its ensure.
    ///
    /// [`Self::RETRY_POLLS`] by default. One budget governs both sides, so the reading budget's
    /// exhaustion submits the ensure and the post-ensure budget's exhaustion parks the arrival
    /// until reconciliation or refit.
    pub retry_polls: u32,
}

impl DeltaPolling {
    /// The pinned polling cadence, in seconds.
    pub(crate) const INTERVAL_SECONDS: u32 = 5;
    /// The pinned per-side retry budget, in staging cycles.
    pub(crate) const RETRY_POLLS: u32 = 12;
    /// The pinned safety lag, in seconds.
    pub(crate) const SAFETY_LAG_SECONDS: u32 = 60;
}

impl Default for DeltaPolling {
    fn default() -> Self {
        Self {
            interval: Duration::from_secs(u64::from(Self::INTERVAL_SECONDS)),
            safety_lag: time::Duration::seconds(i64::from(Self::SAFETY_LAG_SECONDS)),
            retry_polls: Self::RETRY_POLLS,
        }
    }
}

/// One poll failed against the store.
#[derive(Debug)]
pub(crate) enum PollError {
    /// No connection was available for the poll.
    Connect(Report<StoreError>),
    /// The feed statement failed or one of its rows did not decode.
    Feed(Report<QueryError>),
}

impl fmt::Display for PollError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(report) => {
                write!(fmt, "the delta poll reached no store connection: {report}")
            }
            Self::Feed(report) => write!(fmt, "the entity feed read failed: {report}"),
        }
    }
}

impl core::error::Error for PollError {}

/// What one successful poll did.
#[derive(Debug, Copy, Clone)]
struct PollReading {
    /// The events the feed window delivered.
    events: usize,
    /// Whether the poll published a fresh snapshot.
    published: bool,
}

/// One poll's running fold over the feed stream.
#[derive(Debug, Default)]
pub(super) struct PollOutcome {
    /// The events the feed window delivered.
    events: usize,
    /// Whether any application changed publication's resolution input.
    changed: bool,
    /// The newest event time read, or [`None`] for a quiet window.
    watermark: Option<Timestamp<TransactionTime>>,
}

impl PollOutcome {
    /// Returns how many events the feed window delivered.
    #[must_use]
    pub(super) const fn events(&self) -> usize {
        self.events
    }

    /// Returns whether any application changed publication's resolution input.
    #[must_use]
    pub(super) const fn changed(&self) -> bool {
        self.changed
    }

    /// Returns the newest event time read, or [`None`] for a quiet window.
    #[must_use]
    pub(super) const fn watermark(&self) -> Option<Timestamp<TransactionTime>> {
        self.watermark
    }

    /// Folds one event into `register`, counting it whether or not the fold keeps it.
    ///
    /// The poll watermark moves on every event read, because an event the register ignores was
    /// still delivered by the window, and re-reading it buys nothing.
    pub(super) fn fold(&mut self, register: &mut DeltaRegister, event: &EntityEvent) {
        let event = DeltaEvent::from(event);

        self.changed |= register.apply(event);
        self.events += 1;
        self.watermark = Some(
            self.watermark
                .map_or(event.version, |held| held.max(event.version)),
        );
    }
}

/// The long-lived poll arm owning one generation's delta fold.
///
/// One consumer serves one generation for the serving process's lifetime. It holds the mutable
/// [`DeltaRegister`], and every other party reads the [`DeltaCell`] it publishes into. Dropping the
/// task drops the fold with it, and a restart rebuilds it by replay, so the process keeps no delta
/// state anywhere durable.
#[derive(Debug)]
pub(crate) struct DeltaConsumer<T> {
    /// The store pool the feed reads through.
    pool: Arc<PostgresStorePool>,
    /// The serving generation's identity tables, resolving the fold into row space.
    tables: Arc<T>,
    /// The cell requests load snapshots from.
    cell: Arc<DeltaCell>,
    /// The polling knobs.
    polling: DeltaPolling,
    /// The channel carrying the staging arm's frozen placements.
    placements: UnboundedReceiver<(ArchivedEntityId, FrozenPlacement)>,
    /// The fold of every event applied so far.
    register: DeltaRegister,
    /// The newest event time folded through, the next poll's base.
    watermark: Timestamp<TransactionTime>,
    /// The next publication's name in publication order.
    revision: DeltaRevision,
    /// Whether the consumer has published any snapshot yet.
    published: bool,
}

impl<T> DeltaConsumer<T>
where
    T: IdentityTables,
{
    /// Builds the consumer over a generation fitted at `fitted`.
    ///
    /// `fitted` is the transaction-time point the generation's dataset observed. The first poll
    /// replays the feed from it, minus the safety lag, so the fold covers every store change the
    /// fit could not see. `universe` is the generation's base row bound, where the register's
    /// slot allocation starts.
    pub(crate) fn new(
        pool: Arc<PostgresStorePool>,
        tables: Arc<T>,
        cell: Arc<DeltaCell>,
        fitted: Timestamp<TransactionTime>,
        universe: Universe,
        polling: DeltaPolling,
        placements: UnboundedReceiver<(ArchivedEntityId, FrozenPlacement)>,
    ) -> Self {
        Self {
            pool,
            tables,
            cell,
            polling,
            placements,
            register: DeltaRegister::new(universe),
            watermark: fitted,
            revision: DeltaRevision::FIRST,
            published: false,
        }
    }

    /// Polls until the owner drops the task.
    ///
    /// One tick per [`DeltaPolling::interval`], and a poll running past its tick delays the next
    /// rather than bursting to catch up. A failed poll leaves the held snapshot serving, and the
    /// next tick retries from the same watermark.
    pub(crate) async fn run(mut self) -> ! {
        let mut ticks = tokio::time::interval(self.polling.interval);
        ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            ticks.tick().await;

            let replaying = !self.published;
            let started = Instant::now();
            match self.poll().await {
                Ok(reading) if replaying => {
                    tracing::info!(
                        events = reading.events,
                        seconds = started.elapsed().as_secs_f64(),
                        resident_bytes = self.register.resident_estimate(),
                        "replayed the entity feed"
                    );
                }
                Ok(reading) => {
                    if reading.events > 0 {
                        tracing::debug!(
                            events = reading.events,
                            published = reading.published,
                            resident_bytes = self.register.resident_estimate(),
                            "folded the entity feed window"
                        );
                    }
                }
                Err(error) => {
                    tracing::warn!(%error, "a delta poll failed, the held snapshot keeps serving");
                }
            }
        }
    }

    /// Classifies the register's unclassified arrivals, returning whether any verdict changed
    /// publication's resolution input.
    ///
    /// One batched read against the store's present. Failure changes nothing beyond a warning:
    /// the arrivals stay unclassified in the register and the next poll retries them, with the
    /// poll itself still succeeding. An identity the read answers nothing about stays
    /// unclassified the same way, until the feed's own withdrawal resolves it.
    async fn classify_arrivals(&mut self, store: &impl AsClient) -> bool {
        let unclassified: Vec<_> = self.register.unclassified(self.tables.as_ref()).collect();
        if unclassified.is_empty() {
            return false;
        }

        let verdicts = match classify_entities(store, unclassified.iter().copied()).await {
            Ok(verdicts) => verdicts,
            Err(error) => {
                tracing::warn!(
                    %error,
                    arrivals = unclassified.len(),
                    "the classification read failed, unclassified arrivals retry next poll"
                );
                return false;
            }
        };

        // The statement relies on edge multiplicity the writers enforce rather than the schema:
        // a duplicated edge row would fan one request into two verdict rows, so an answer count
        // above the request count is the same broken-store signal as one below it.
        if verdicts.len() > unclassified.len() {
            tracing::warn!(
                answers = verdicts.len(),
                requests = unclassified.len(),
                "the classification read answered more identities than the request named, a store \
                 invariant the statement relies on broke"
            );
        }

        let unanswered = unclassified.len().saturating_sub(verdicts.len());
        if unanswered > 0 {
            tracing::debug!(
                unanswered,
                "identities without a current edition stay unclassified until the feed resolves \
                 them"
            );
        }

        let mut disposition = Disposition::AlreadyHeld;
        for (entity, verdict) in verdicts {
            if let Classification::Link { source, target } = verdict
                && (source.is_none() || target.is_none())
            {
                tracing::warn!(
                    ?entity,
                    "a link arrival's attachment pair is incomplete, no edge registers"
                );
            }

            disposition |= self.register.classify(entity, verdict);
        }
        disposition.changes_resolution()
    }

    /// Drains the staging arm's placement channel, returning whether any placement changed
    /// publication's resolution input.
    ///
    /// Every queued placement folds into the register in channel order, which is what makes the
    /// slot assignment follow placement order. A placement for an already-placed identity
    /// changes nothing, because the first coordinate froze, and a placement for a withdrawn
    /// identity records without publishing, so the drain never grows the served set on its own.
    /// A refused slot warns and drops the placement: the arrival stays staged, and the refusal
    /// repeats at every later projection until a refit retires the register.
    fn drain_placements(&mut self) -> bool {
        let mut disposition = Disposition::AlreadyHeld;

        while let Ok((entity, placement)) = self.placements.try_recv() {
            match self.register.place(entity, placement) {
                Ok(placed) => disposition |= placed,
                Err(exhausted) => {
                    tracing::warn!(
                        ?entity,
                        %exhausted,
                        "the slot allocator refused a placement, the arrival stays staged"
                    );
                }
            }
        }

        disposition.changes_resolution()
    }

    /// Runs one poll, folding the feed window and publishing when resolution changed.
    ///
    /// The first successful poll publishes unconditionally, so an empty fold still states its
    /// watermark, and a cell holding [`None`] means no poll has completed rather than nothing
    /// withdrawn.
    ///
    /// # Errors
    ///
    /// Returns [`PollError::Connect`] when no connection was available for the poll, and
    /// [`PollError::Feed`] when the feed statement failed or one of its rows did not decode.
    async fn poll(&mut self) -> Result<PollReading, PollError> {
        let store = self
            .pool
            .acquire(None)
            .await
            .map_err(|report| PollError::Connect(report.change_context(StoreError)))?;

        let mut outcome = PollOutcome::default();
        {
            // The feed executes as a fresh prepare on every call: a reused prepared statement
            // flips to a generic plan around its sixth execution, and this cadence crosses that
            // count within half a minute of startup.
            let mut events =
                pin!(store.entity_events_since(self.watermark - self.polling.safety_lag));
            while let Some(event) = events.try_next().await.map_err(PollError::Feed)? {
                outcome.fold(&mut self.register, &event);
            }
        }

        let classified = self.classify_arrivals(&store).await;

        // Nothing further reads the store: return the connection before resolving the publication.
        drop(store);

        let placed = self.drain_placements();

        if let Some(watermark) = outcome.watermark() {
            self.watermark = watermark;
        }

        let publishing = outcome.changed() || classified || placed || !self.published;
        if publishing {
            self.cell.publish(self.register.snapshot(
                self.tables.as_ref(),
                self.revision,
                self.watermark,
            ));
            self.revision = self.revision.next();
            self.published = true;
        }

        Ok(PollReading {
            events: outcome.events(),
            published: publishing,
        })
    }
}
