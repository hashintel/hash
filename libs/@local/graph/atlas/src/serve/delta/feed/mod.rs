//! Event coalescing and placement delivery for one mutable delta.
//!
//! Each entity retains its newest event version across overlapping feed reads. Placements match
//! completions to pending versions under [`EventId`]'s range conditions. A withdrawal discards its
//! pending update, preventing a later result from reviving it. Store poll failures retry the poll.
//! Classification and display failures retry without advancing the failed stage. Missing
//! classification or display rows also retry. Within one feed task, a delivered placement failure
//! is terminal for that event version, whose overlap record remains until an event with a later
//! transaction time replaces it.

mod pending;

#[cfg(test)]
mod tests;

use alloc::sync::Arc;
use core::{fmt, future::Future, ops::ControlFlow, pin::pin, time::Duration};

use arc_swap::ArcSwap;
use error_stack::{Report, ReportSink, ResultExt as _};
use futures::StreamExt as _;
use hash_graph_postgres_store::store::{EntityEvent, PostgresStorePool};
use hash_graph_store::{error::QueryError, pool::StorePool as _};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::{collections::FastHashMap, id::Id as _};
use tokio::{
    sync::{
        Notify,
        mpsc::{self, Permit, error::TrySendError},
        oneshot,
    },
    time::Interval,
};
use type_system::knowledge::entity::id::EntityEditionId;

use self::pending::{DeltaAction, Pending};
use super::{
    Delta,
    placement::{Completed, Initial, PendingEntry},
};
use crate::{
    math::Vec2,
    postgres::{self, edition_display::DisplayParts, id::ArchivedEntityId},
};

/// A feed configuration or execution failure.
#[derive(Debug)]
pub(super) enum DeltaFeedError {
    /// The polling interval is zero or outside the monotonic clock's range.
    InvalidInterval,
    /// The replay safety lag is unrepresentable or precedes the transaction-time range.
    InvalidSafetyLag,
    /// The publication exchange closed before answering.
    Closed,
    /// Acquiring a store connection failed.
    Connect,
    /// Reading the entity-event stream failed.
    Event,
    /// Classifying pending entities failed.
    Classification,
    /// Reading pending editions' display metadata failed.
    Display,
    /// The placement request or completion channel closed.
    PlacementClosed,
}

impl fmt::Display for DeltaFeedError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInterval => fmt.write_str(
                "the feed polling interval must be non-zero and fit the monotonic clock",
            ),
            Self::InvalidSafetyLag => {
                fmt.write_str("the safety lag precedes the representable transaction-time range")
            }
            Self::Closed => fmt.write_str("the feed task stopped before publication"),
            Self::Connect => fmt.write_str("failed to connect to the database"),
            Self::Event => fmt.write_str("failed to read entity events"),
            Self::Classification => fmt.write_str("failed to classify entities"),
            Self::Display => fmt.write_str("failed to read edition displays"),
            Self::PlacementClosed => fmt.write_str("the placement task stopped"),
        }
    }
}

impl core::error::Error for DeltaFeedError {}

hashql_core::id::newtype! {
    /// A per-delta sequence number for a coalesced entity update.
    ///
    /// New unarchived updates advance the counter through `usize` arithmetic.
    ///
    /// # Panics
    ///
    /// At `u32::MAX`, the next increment panics on a 64-bit target or with overflow checking on a 32-bit target.
    ///
    /// # Warning
    ///
    /// On a 32-bit target without overflow checking, the counter wraps after 2³² increments. A delayed placement result can then match a newer update of the same entity if its event ID repeats.
    pub(crate) struct EventId(u32)
}

/// Submits placement requests for entities awaiting a wire position, in encounter order.
///
/// A supplied `permit` covers exactly one request. Once spent, further requests use `tx` directly
/// and stop at its first full or closed channel.
fn pump(
    pending: &mut Pending,
    tx: &mpsc::Sender<PendingEntry<Initial>>,
    mut permit: Option<Permit<'_, PendingEntry<Initial>>>,
) -> ControlFlow<()> {
    let mut placements = pending.placements();
    while let Some(placement) = placements.next_placement() {
        let request = placement.request();
        if let Some(permit) = permit.take() {
            permit.send(request);
        } else {
            match tx.try_send(request) {
                Ok(()) => {}
                Err(TrySendError::Full(_)) => break,
                Err(TrySendError::Closed(_)) => return ControlFlow::Break(()),
            }
        }
        placement.submitted();
    }
    ControlFlow::Continue(())
}

/// The feed's replay lag and polling cadence.
#[derive(Copy, Clone)]
pub(crate) struct DeltaFeedTaskOptions {
    /// How far behind the transaction-time watermark the feed replays events from.
    pub safety_lag: Duration,
    /// How often the feed polls for new events and re-evaluates pending work.
    pub tick_rate: Duration,
}

/// The feed's ends of the placement request and completion channels.
pub(super) struct Placement {
    /// Placement requests sent after classification identifies an unplaced node.
    pub requests: mpsc::Sender<PendingEntry<Initial>>,
    /// Placement outcomes returned for version-checked application.
    pub completed: mpsc::Receiver<PendingEntry<Completed>>,
}

/// A single publisher's change notification and delta exchange.
///
/// The notification stores at most one wake-up. Changes coalesce while the publisher is busy. The
/// next exchange transfers the feed's complete accumulated working delta.
pub(super) struct Publication {
    notify: Arc<Notify>,
    update: mpsc::Sender<(Delta, oneshot::Sender<Delta>)>,
}

impl Publication {
    /// Waits for the next change notification, then exchanges the caller's delta for the task's.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError::Closed`] if the feed task stops before completing the exchange.
    pub(super) async fn next(&self, previous: Arc<Delta>) -> Result<Delta, Report<DeltaFeedError>> {
        tokio::select! {
            biased;
            () = self.update.closed() => return Err(Report::new(DeltaFeedError::Closed)),
            () = self.notify.notified() => {}
        }

        let (tx, rx) = oneshot::channel();
        self.update
            .send((Arc::unwrap_or_clone(previous), tx))
            .await
            .change_context(DeltaFeedError::Closed)?;

        rx.await.change_context(DeltaFeedError::Closed)
    }

    /// Exchanges deltas after change notifications until `shutdown` resolves.
    ///
    /// Multiple notifications may coalesce before one exchange. Shutdown wins over a pending
    /// notification. This leaves the last already-exchanged delta published rather than forcing
    /// the feed's working copy into the reader.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError::Closed`] if the feed task stops before shutdown.
    pub(super) async fn run(
        self,
        current: Arc<ArcSwap<Delta>>,
        mut previous: Arc<Delta>,
        shutdown: impl Future<Output = ()>,
    ) -> Result<(), Report<DeltaFeedError>> {
        let mut shutdown = pin!(shutdown);

        // `next` waits for notification before `Arc::unwrap_or_clone(previous)`. The wait allows
        // holders of `previous` to drop their strong references. At one strong reference, the
        // operation moves the `Delta` value without cloning it.
        loop {
            let next = tokio::select! {
                biased;
                () = &mut shutdown => return Ok(()),
                next = self.next(previous) => next?,
            };

            previous = current.swap(Arc::new(next));
        }
    }
}

/// Reused buffers for one tick's database, classification and display work.
#[derive(Default)]
struct DeltaFeedTaskScratch {
    events: Vec<EntityEvent>,
    positions: Vec<Vec2>,
    entities: Vec<ArchivedEntityId>,
    editions: Vec<EntityEditionId>,
    displays: FastHashMap<EntityEditionId, Option<DisplayParts>>,
}

/// One generation's entity-feed task for polling, event coalescing and delta application.
pub(super) struct DeltaFeedTask {
    delta: Delta,
    pool: Arc<PostgresStorePool>,
    options: DeltaFeedTaskOptions,

    watermark: Timestamp<TransactionTime>,
    safety_lag: ::time::Duration,
    replayed: bool,

    update: mpsc::Receiver<(Delta, oneshot::Sender<Delta>)>,
    notify: Arc<Notify>,

    placement: Option<Placement>,

    pending: Pending,
    scratch: DeltaFeedTaskScratch,
}

impl DeltaFeedTask {
    /// Prepares replay from `delta` and the base snapshot's transaction-time `watermark`.
    ///
    /// The working revision increments once under [`DeltaRevision`](super::DeltaRevision)'s
    /// arithmetic conditions. Without placement channels, new node placements remain pending while
    /// withdrawals and metadata updates continue. Construction starts no task and opens no database
    /// connection.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError::InvalidInterval`] for a zero or unrepresentable polling interval.
    /// Returns [`DeltaFeedError::InvalidSafetyLag`] when the timestamp types cannot represent the
    /// safety lag or the resulting replay window precedes their range.
    ///
    /// # Panics
    ///
    /// With overflow checking, panics if option validation succeeds and the revision's `usize`
    /// conversion equals `usize::MAX`.
    pub(super) fn new(
        mut delta: Delta,
        pool: Arc<PostgresStorePool>,
        options: DeltaFeedTaskOptions,
        watermark: Timestamp<TransactionTime>,
        placement: Option<Placement>,
    ) -> Result<(Self, Publication), Report<DeltaFeedError>> {
        if options.tick_rate.is_zero()
            || tokio::time::Instant::now()
                .checked_add(options.tick_rate)
                .is_none()
        {
            return Err(Report::new(DeltaFeedError::InvalidInterval));
        }

        let safety_lag = ::time::Duration::try_from(options.safety_lag)
            .change_context(DeltaFeedError::InvalidSafetyLag)?;

        let earliest = Timestamp::from_unix_timestamp(
            ::time::Date::MIN.midnight().assume_utc().unix_timestamp(),
        );

        if safety_lag > watermark - earliest {
            return Err(Report::new(DeltaFeedError::InvalidSafetyLag));
        }

        let (tx, rx) = mpsc::channel(1);

        let notify = Arc::new(Notify::new());
        let publication = Publication {
            notify: Arc::clone(&notify),
            update: tx,
        };

        delta.revision.increment_by(1);

        let this = Self {
            delta,
            pool,
            options,
            watermark,
            safety_lag,
            replayed: false,
            update: rx,
            notify,
            placement,
            pending: Pending::default(),
            scratch: DeltaFeedTaskScratch::default(),
        };

        Ok((this, publication))
    }

    /// Runs the feed's tick loop until its update channel closes, notifying on every change.
    ///
    /// The task logs store polling, classification and display failures and retries them on later
    /// ticks. They do not end this loop. A closed update channel is normal publication shutdown.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError::PlacementClosed`] if the placement channels close.
    ///
    /// # Panics
    ///
    /// Panics unless polled within a Tokio runtime with time enabled. A sufficiently late tick can
    /// also panic when adding [`DeltaFeedTaskOptions::tick_rate`] to the current instant would
    /// exceed Tokio's representable deadline. The panic conditions on [`Self::step`] also apply.
    pub(super) async fn run(mut self) -> Result<(), Report<DeltaFeedError>> {
        let mut interval = tokio::time::interval(self.options.tick_rate);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        while let ControlFlow::Continue(changed) = self.step(&mut interval).await? {
            if changed {
                self.notify.notify_one();
            }
        }

        Ok(())
    }

    /// Advances one feed event.
    ///
    /// An event is a poll, a placement submission, a placement result or an exchange.
    ///
    /// Returns whether the delta changed, or [`ControlFlow::Break`] once the update channel closes.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError::PlacementClosed`] if the placement channels close.
    ///
    /// # Panics
    ///
    /// Panics under the conditions on [`Self::tick`] or [`Self::exchange`]. A late tick can also
    /// panic if `interval` computes an unrepresentable next deadline.
    async fn step(
        &mut self,
        interval: &mut Interval,
    ) -> Result<ControlFlow<(), bool>, Report<DeltaFeedError>> {
        let tx = self
            .placement
            .as_ref()
            .map(|placement| placement.requests.clone());

        let changed = tokio::select! {
            _ = interval.tick() => match self.tick().await {
                Ok(changed) => changed,
                Err(error) => {
                    tracing::warn!(?error, "Retry the entity feed on the next tick");
                    false
                }
            },
            permit = async {
                match &tx {
                    Some(tx) => tx.reserve().await,
                    None => core::future::pending().await,
                }
            }, if self.pending.has_placements() => {
                let permit = permit.change_context(DeltaFeedError::PlacementClosed)?;
                let tx = tx.as_ref().expect("should have a placement sender after reserving capacity");
                if pump(&mut self.pending, tx, Some(permit)).is_break() {
                    return Err(Report::new(DeltaFeedError::PlacementClosed));
                }

                false
            },
            result = async {
                match &mut self.placement {
                    Some(placement) => placement.completed.recv().await,
                    None => core::future::pending().await,
                }
            } => {
                let result = result.ok_or_else(|| Report::new(DeltaFeedError::PlacementClosed))?;
                let placement = self.placement.as_mut().expect("should have placement channels after receiving a result");
                self.pending.receive(result);
                while let Ok(result) = placement.completed.try_recv() {
                    self.pending.receive(result);
                }

                self.pending.normalize(self.delta.world.bounds(), &mut self.scratch.positions);
                self.pending.apply(&mut self.delta)
            },
            request = self.update.recv() => {
                let Some((previous, reply)) = request else {
                    return Ok(ControlFlow::Break(()));
                };

                self.exchange(previous, reply);
                false
            },
        };

        if let Some(placement) = &self.placement
            && pump(&mut self.pending, &placement.requests, None).is_break()
        {
            return Err(Report::new(DeltaFeedError::PlacementClosed));
        }

        Ok(ControlFlow::Continue(changed))
    }

    /// Exchanges the working delta and reuses `previous` for further changes.
    ///
    /// Revision arithmetic follows [`DeltaRevision`](super::DeltaRevision). If the current revision
    /// fits `usize`, a cancelled reply restores that revision. Narrowing on a 32-bit target can
    /// instead discard its upper bits before the increment and rollback.
    ///
    /// # Panics
    ///
    /// With overflow checking, panics if the current revision's `usize` conversion equals
    /// `usize::MAX`.
    fn exchange(&mut self, mut previous: Delta, reply: oneshot::Sender<Delta>) {
        previous.clone_from(&self.delta);
        previous.revision.increment_by(1);

        let requested = core::mem::replace(&mut self.delta, previous);
        if reply.send(requested).is_err() {
            self.delta.revision.decrement_by(1);
        }
    }

    /// Reads entity events since the safety-lagged watermark and applies their withdrawals.
    ///
    /// Returns whether the delta changed.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError::Connect`] or [`DeltaFeedError::Event`] for a store failure.
    ///
    /// # Panics
    ///
    /// Panics under [`Self::apply_events`]' counter and history-order conditions after a successful
    /// stream read.
    async fn poll_database(&mut self) -> Result<bool, Report<DeltaFeedError>> {
        self.scratch.events.clear();
        let pool = Arc::clone(&self.pool);
        let store = pool
            .acquire(None)
            .await
            .change_context(DeltaFeedError::Connect)?;

        let mut sink = ReportSink::<QueryError>::new_armed();

        let stream = store.entity_events_since(self.watermark - self.safety_lag);
        let mut stream = pin!(stream);

        while let Some(result) = stream.next().await {
            if let Some(event) = sink.attempt(result) {
                self.scratch.events.push(event);
            }
        }

        sink.finish().change_context(DeltaFeedError::Event)?;
        Ok(self.apply_events())
    }

    /// Coalesces drained events and advances the transaction-time high-water mark.
    ///
    /// Each event raises the watermark to the greater of its current value and the event's
    /// transaction time. Input order cannot move it backward.
    ///
    /// Returns whether the delta changed, including the first call after construction.
    ///
    /// # Panics
    ///
    /// Panics if a newer unarchived update exhausts the event counter under [`Pending::observe`]'s
    /// target-width and overflow-checking conditions. Withdrawals also have [`Delta::withdraw`]'s
    /// history-order condition.
    fn apply_events(&mut self) -> bool {
        let mut changed = false;

        for event in self.scratch.events.drain(..) {
            self.watermark = self.watermark.max(Pending::identity_and_time(&event).1);
            match self.pending.observe(event) {
                DeltaAction::None => {}
                DeltaAction::Withdraw(entity) => changed |= self.delta.withdraw(entity),
            }
        }

        changed |= !self.replayed;
        self.replayed = true;
        changed
    }

    /// Classifies entities awaiting a node/edge decision and advances their pending stage.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError::Connect`] or [`DeltaFeedError::Classification`] for a store
    /// failure.
    async fn classify(&mut self) -> Result<(), Report<DeltaFeedError>> {
        self.scratch.entities.clear();
        self.scratch.entities.extend(self.pending.classifications());

        if self.scratch.entities.is_empty() {
            return Ok(());
        }

        let pool = Arc::clone(&self.pool);
        let store = pool
            .acquire(None)
            .await
            .change_context(DeltaFeedError::Connect)?;
        let classifications = postgres::classify_entities(&store, self.scratch.entities.drain(..))
            .await
            .change_context(DeltaFeedError::Classification)?;

        self.pending.classify(&self.delta, classifications);
        Ok(())
    }

    /// Reads edition displays for entities awaiting one and advances their pending stage.
    ///
    /// Returns whether the delta changed.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError::Connect`] or [`DeltaFeedError::Display`] for a store failure.
    ///
    /// # Panics
    ///
    /// Panics under [`Pending::capture`]'s revision and allocation conditions.
    async fn capture_displays(&mut self) -> Result<bool, Report<DeltaFeedError>> {
        self.scratch.editions.clear();
        self.scratch.editions.extend(self.pending.editions());

        if self.scratch.editions.is_empty() {
            return Ok(false);
        }
        let total_editions = self.scratch.editions.len();

        let store = self
            .pool
            .acquire(None)
            .await
            .change_context(DeltaFeedError::Connect)?;
        let displays = postgres::read_edition_displays(&store, self.scratch.editions.drain(..))
            .await
            .change_context(DeltaFeedError::Display)?;

        if displays.len() != total_editions {
            tracing::warn!(
                answers = displays.len(),
                requests = total_editions,
                "The display read returned a different edition count"
            );
        }

        self.scratch.displays.extend(displays);
        Ok(self
            .pending
            .capture(&mut self.delta, &mut self.scratch.displays))
    }

    /// Runs one poll/classify/capture/apply cycle, retrying a failed stage on the next tick.
    ///
    /// Returns whether the delta changed.
    ///
    /// # Errors
    ///
    /// Returns [`DeltaFeedError`] only for a database poll failure. Classification and display
    /// failures are logged and retried.
    ///
    /// # Panics
    ///
    /// The panic conditions on [`Self::poll_database`], [`Self::capture_displays`] and
    /// [`Pending::apply`] also apply.
    async fn tick(&mut self) -> Result<bool, Report<DeltaFeedError>> {
        let mut changed = self.poll_database().await?;
        if let Err(error) = self.classify().await {
            tracing::warn!(?error, "Retry entity classification on the next tick");
        }

        match self.capture_displays().await {
            Ok(captured) => changed |= captured,
            Err(error) => tracing::warn!(?error, "Retry edition displays on the next tick"),
        }

        changed |= self.pending.apply(&mut self.delta);
        Ok(changed)
    }
}
