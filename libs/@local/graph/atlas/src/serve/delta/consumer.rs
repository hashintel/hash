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
//! Each poll also drains the placement channel the staging arm feeds, folding every projected
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
use hashql_core::collections::FastHashMap;
use tokio::{sync::mpsc::Receiver, time::MissedTickBehavior};

use super::{
    DeltaCell, DeltaEvent, DeltaRegister, DeltaRevision, Disposition, IdentityTables,
    ProjectedArrival,
};
use crate::postgres::{
    Classification, classify_entities, edition_display::DisplayParts, id::ArchivedEntityId,
    read_edition_displays,
};

/// The consumer's polling knobs.
///
/// The serve flags read their defaults from here, so the values live in exactly one place and
/// `--help` renders them.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct DeltaPolling {
    /// How long the consumer waits between polls.
    pub interval: Duration = Duration::from_secs(5),
    /// How far behind its own watermark a poll starts reading.
    ///
    /// The feed's contract requires the lag to exceed the
    /// longest write request plus the largest cross-writer clock skew. Nobody has measured either
    /// bound, so the default stands wide until a measurement revises it downward. Query
    /// affordability cannot establish event completeness, so a tighter lag is an accepted-risk
    /// decision rather than a performance tuning.
    pub safety_lag: Duration = Duration::from_secs(60),
    /// How many consecutive staging cycles read for a pending arrival's embedding on each side
    /// of its ensure.
    ///
    /// One budget governs both sides, so the reading budget's
    /// exhaustion submits the ensure and the post-ensure budget's exhaustion parks the arrival
    /// until reconciliation or refit.
    pub retry_polls: u32 = 10,
    /// How many pending arrivals the consumer will backlog before parking.
    pub placement_backlog: usize = 1024,
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
    /// The channel carrying the staging arm's projected arrivals, bounded at
    /// [`DeltaPolling::placement_backlog`].
    placements: Receiver<(ArchivedEntityId, ProjectedArrival)>,
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
    /// fit could not see. `register` is the empty fold the caller built over the generation's
    /// row bounds, where every allocation starts.
    pub(crate) const fn new(
        pool: Arc<PostgresStorePool>,
        tables: Arc<T>,
        cell: Arc<DeltaCell>,
        fitted: Timestamp<TransactionTime>,
        register: DeltaRegister,
        polling: DeltaPolling,
        placements: Receiver<(ArchivedEntityId, ProjectedArrival)>,
    ) -> Self {
        Self {
            pool,
            tables,
            cell,
            polling,
            placements,
            register,
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
            if let Classification::Edge { source, target } = verdict
                && (source.is_none() || target.is_none())
            {
                tracing::warn!(
                    ?entity,
                    "a link arrival's attachment pair is incomplete, no edge registers"
                );
            }

            match self.register.classify(entity, verdict) {
                Ok(held) => disposition |= held,
                Err(exhausted) => tracing::warn!(
                    ?entity,
                    %exhausted,
                    "the edge row allocator refused a verdict, the identity stays unclassified"
                ),
            }
        }
        disposition.changes_resolution()
    }

    /// Captures the legends the register lists as pending, returning whether any capture landed.
    ///
    /// One batched read against the edition cache, keyed by edition, because an edition id
    /// names one immutable row. Failure changes nothing beyond a warning: the captures stay
    /// pending and the next poll retries them, with the poll itself still succeeding. The
    /// statement answers every requested edition exactly once, so a short answer is a broken
    /// store invariant rather than a lookup miss - warned loudly, because a permanently
    /// unanswered link edition means publication withholds that link with no other signal.
    async fn capture_displays(&mut self, store: &impl AsClient) -> bool {
        let required: Vec<_> = self
            .register
            .pending_captures(self.tables.as_ref())
            .collect();
        if required.is_empty() {
            return false;
        }

        let answers = match read_edition_displays(
            store,
            required.iter().map(|&(_, edition)| edition),
        )
        .await
        {
            Ok(answers) => answers,
            Err(error) => {
                tracing::warn!(
                    %error,
                    pending = required.len(),
                    "the display read failed, pending captures retry next poll"
                );
                return false;
            }
        };

        // The statement answers every requested edition exactly once - `UNNEST` yields one
        // row per element, and both outer joins match at most one row each, through
        // `entity_edition_cache`'s primary key and `ontology_ids`' unique (base_url, version)
        // pair - a mismatched count is therefore a broken store invariant rather than a
        // lookup miss.
        if answers.len() != required.len() {
            tracing::warn!(
                answers = answers.len(),
                pending = required.len(),
                "the display read answered a different edition count than the listing named"
            );
        }

        // An answer without a resolved representative type stays pending, so the next poll
        // reads it again: a legend cannot exist until the representative resolves.
        let displays: FastHashMap<_, _> = answers.into_iter().collect();
        let mut captured = false;
        for (entity, edition) in required {
            if let Some(Some(DisplayParts {
                label,
                icon,
                representative,
            })) = displays.get(&edition)
            {
                match self.register.capture_display(
                    entity,
                    edition,
                    label,
                    icon,
                    *representative,
                    self.tables.as_ref(),
                ) {
                    Ok(()) => captured = true,
                    Err(exhausted) => tracing::warn!(
                        ?entity,
                        %exhausted,
                        "the ontology row allocator refused a capture, it stays pending"
                    ),
                }
            }
        }

        captured
    }

    /// Drains the staging arm's placement channel, returning whether any placement changed
    /// publication's resolution input.
    ///
    /// Every queued placement folds into the register in channel order, which is what makes the
    /// row assignment follow placement order. A placement for an already-placed identity
    /// changes nothing, because the first coordinate never moves, and a placement for a
    /// withdrawn identity records without publishing, so the drain never grows the served set on
    /// its own. A refused allocation warns and drops the placement: the arrival stays staged,
    /// and the refusal repeats at every later projection until a refit retires the register.
    fn drain_placements(&mut self) -> bool {
        let mut disposition = Disposition::AlreadyHeld;

        while let Ok((entity, arrival)) = self.placements.try_recv() {
            match self.register.place(entity, &arrival, self.tables.as_ref()) {
                Ok(placed) => disposition |= placed,
                Err(exhausted) => {
                    tracing::warn!(
                        ?entity,
                        %exhausted,
                        "the row allocator refused a placement, the arrival stays staged"
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
        let safety_lag = time::Duration::try_from(self.polling.safety_lag).expect(
            "the safety lag should be in the range of minutes, which should be able to be \
             converted to its time equivalent",
        );
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
            let mut events = pin!(store.entity_events_since(self.watermark - safety_lag));
            while let Some(event) = events.try_next().await.map_err(PollError::Feed)? {
                outcome.fold(&mut self.register, &event);
            }
        }

        let classified = self.classify_arrivals(&store).await;
        let captured = self.capture_displays(&store).await;

        // Nothing further reads the store: return the connection before resolving the publication.
        drop(store);

        let placed = self.drain_placements();

        if let Some(watermark) = outcome.watermark() {
            self.watermark = watermark;
        }

        let publishing = outcome.changed() || classified || captured || placed || !self.published;
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
