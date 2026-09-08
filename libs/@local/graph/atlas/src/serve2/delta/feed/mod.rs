//! Event coalescing and placement delivery for one mutable delta.
//!
//! Each entity retains its newest event version across overlapping feed reads. Placements complete
//! against that version, preventing an older result from reviving a withdrawn entity. Database
//! classification and display misses retry on polling ticks.

mod pending;

#[cfg(test)]
mod tests;

use alloc::sync::Arc;
use core::{fmt, ops::ControlFlow, pin::pin, time::Duration};

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

#[derive(Debug)]
enum DeltaFeedError {
    Connect,
    Event,
    Classification,
    Display,
    PlacementClosed,
}

impl fmt::Display for DeltaFeedError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
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
    pub(crate) struct EventId(u32)
}

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

struct DeltaFeedTaskOptions {
    safety_lag: Duration,
    tick_rate: Duration,
}

#[derive(Default)]
struct DeltaFeedTaskScratch {
    events: Vec<EntityEvent>,
    positions: Vec<Vec2>,
    entities: Vec<ArchivedEntityId>,
    editions: Vec<EntityEditionId>,
    displays: FastHashMap<EntityEditionId, Option<DisplayParts>>,
}

struct DeltaFeedTask {
    delta: Delta,
    pool: Arc<PostgresStorePool>,
    options: DeltaFeedTaskOptions,

    watermark: Timestamp<TransactionTime>,
    safety_lag: ::time::Duration,
    replayed: bool,

    update: mpsc::Receiver<(Delta, oneshot::Sender<Delta>)>,
    notify: Notify,

    rx: mpsc::Receiver<PendingEntry<Completed>>,
    tx: mpsc::Sender<PendingEntry<Initial>>,

    pending: Pending,
    scratch: DeltaFeedTaskScratch,
}

impl DeltaFeedTask {
    async fn run(&mut self) -> Result<(), Report<DeltaFeedError>> {
        let mut interval = tokio::time::interval(self.options.tick_rate);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        while let ControlFlow::Continue(changed) = self.step(&mut interval).await? {
            if changed {
                self.notify.notify_one();
            }
        }

        Ok(())
    }

    #[expect(
        clippy::integer_division_remainder_used,
        reason = "Tokio select uses a remainder to randomize its first branch"
    )]
    async fn step(
        &mut self,
        interval: &mut Interval,
    ) -> Result<ControlFlow<(), bool>, Report<DeltaFeedError>> {
        let tx = self.tx.clone();
        let changed = tokio::select! {
            _ = interval.tick() => match self.tick().await {
                Ok(changed) => changed,
                Err(error) => {
                    tracing::warn!(?error, "Retry the entity feed on the next tick");
                    false
                }
            },
            permit = tx.reserve(), if self.pending.has_placements() => {
                let permit = permit.change_context(DeltaFeedError::PlacementClosed)?;
                if pump(&mut self.pending, &self.tx, Some(permit)).is_break() {
                    return Err(Report::new(DeltaFeedError::PlacementClosed));
                }

                false
            },
            result = self.rx.recv() => {
                let result = result.ok_or_else(|| Report::new(DeltaFeedError::PlacementClosed))?;

                self.pending.receive(result);
                while let Ok(result) = self.rx.try_recv() {
                    self.pending.receive(result);
                }

                self.pending.normalize(self.delta.world.fitted_bounds(), &mut self.scratch.positions);
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

        if pump(&mut self.pending, &self.tx, None).is_break() {
            return Err(Report::new(DeltaFeedError::PlacementClosed));
        }

        Ok(ControlFlow::Continue(changed))
    }

    fn exchange(&mut self, mut previous: Delta, reply: oneshot::Sender<Delta>) {
        previous.clone_from(&self.delta);
        previous.revision.increment_by(1);

        let requested = core::mem::replace(&mut self.delta, previous);
        if reply.send(requested).is_err() {
            self.delta.revision.decrement_by(1);
        }
    }

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
