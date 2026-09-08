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
use hash_graph_postgres_store::store::{EntityEvent, EntityUpdate, PostgresStorePool};
use hash_graph_store::{error::QueryError, pool::StorePool as _};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::{collections::FastHashMap, id::Id as _};
use tokio::{
    sync::{
        Notify,
        mpsc::{self, Permit},
        oneshot,
    },
    time::Interval,
};
use type_system::knowledge::entity::id::EntityEditionId;

use self::pending::{DeltaAction, Pending, Placement, Stage};
use super::{
    Delta,
    placement::{Completed, Initial, PendingEntry},
};
use crate::{
    dataset::auxiliary::OwnedLegend,
    math::Vec2,
    postgres::{self, Classification, edition_display::DisplayParts, id::ArchivedEntityId},
    salt::lod::stage::WIRE_FRAME,
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

struct DeltaFeedTaskOptions {
    safety_lag: Duration,
    tick_rate: Duration,
}

#[derive(Default)]
struct DeltaFeedTaskScratch {
    events: Vec<EntityEvent>,
    completed: Vec<(EventId, ArchivedEntityId)>,
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
            permit = tx.reserve(), if self.pending.next_placement().is_some() => {
                let permit = permit.change_context(DeltaFeedError::PlacementClosed)?;
                if self.pump(Some(permit)).is_break() {
                    return Err(Report::new(DeltaFeedError::PlacementClosed));
                }

                false
            },
            result = self.rx.recv() => {
                let result = result.ok_or_else(|| Report::new(DeltaFeedError::PlacementClosed))?;

                self.receive(result);
                while let Ok(result) = self.rx.try_recv() {
                    self.receive(result);
                }

                self.apply_placements();
                self.apply_ready()
            },
            request = self.update.recv() => {
                let Some((previous, reply)) = request else {
                    return Ok(ControlFlow::Break(()));
                };

                self.exchange(previous, reply);
                false
            },
        };

        if self.pump(None).is_break() {
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
        self.scratch
            .entities
            .extend(self.pending.updates.iter().filter_map(|(&entity, update)| {
                matches!(update.stage, Stage::Classify).then_some(entity)
            }));

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

        self.apply_classifications(classifications);
        Ok(())
    }

    fn apply_classifications(
        &mut self,
        classifications: impl IntoIterator<Item = (ArchivedEntityId, Classification)>,
    ) {
        for (entity, classification) in classifications {
            let Some(
                update @ pending::Update {
                    stage: Stage::Classify,
                    ..
                },
            ) = self.pending.updates.get_mut(&entity)
            else {
                continue;
            };

            update.stage = match classification {
                Classification::Node => Stage::Node(
                    self.delta
                        .node_position(entity)
                        .map_or(Placement::Waiting, Placement::Ready),
                ),
                Classification::Edge { source, target } => {
                    if source.is_none() || target.is_none() {
                        tracing::warn!(?entity, "The link has an incomplete endpoint pair");
                    }

                    Stage::Edge { source, target }
                }
            };
        }
    }

    async fn capture_displays(&mut self) -> Result<bool, Report<DeltaFeedError>> {
        self.scratch.editions.clear();
        self.scratch.editions.extend(
            self.pending
                .updates
                .values()
                .filter(|update| update.needs_legend())
                .map(|update| update.event.edition),
        );

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
        Ok(self.apply_displays())
    }

    fn apply_displays(&mut self) -> bool {
        let mut changed = false;

        for update in self
            .pending
            .updates
            .values_mut()
            .filter(|update| update.needs_legend())
        {
            let Some(Some(DisplayParts {
                label,
                icon,
                representative,
            })) = self.scratch.displays.remove(&update.event.edition)
            else {
                continue;
            };

            let Some((representative, registered)) =
                self.delta.register_ontology(representative, icon)
            else {
                tracing::warn!(entity = ?update.event.entity, "No ontology row remains for the display");
                continue;
            };

            changed |= registered;
            update.legend = Some(OwnedLegend::new(representative, &label));
        }

        changed
    }

    fn receive(
        &mut self,
        PendingEntry {
            event,
            entity,
            phase: Completed(result),
        }: PendingEntry<Completed>,
    ) {
        let entity = ArchivedEntityId::from(entity);
        if !self.pending.complete(entity, event) {
            return;
        }

        match result {
            Ok(position) => {
                self.scratch.completed.push((event, entity));
                self.scratch.positions.push(position.get());
            }
            Err(error) => {
                self.pending.updates.remove(&entity);
                tracing::warn!(?entity, ?error, "Discard the failed placement");
            }
        }
    }

    fn apply_placements(&mut self) {
        if self.scratch.positions.is_empty() {
            return;
        }

        let positions = self
            .delta
            .world
            .fitted_bounds()
            .normalize_into(WIRE_FRAME, &self.scratch.positions);

        for ((event, entity), position) in self.scratch.completed.drain(..).zip(positions) {
            if let Some(update) = self
                .pending
                .updates
                .get_mut(&entity)
                .filter(|update| update.id == event)
            {
                update.stage = Stage::Node(Placement::Ready(position));
            }
        }

        self.scratch.positions.clear();
    }

    fn pump(&mut self, mut permit: Option<Permit<'_, PendingEntry<Initial>>>) -> ControlFlow<()> {
        while let Some(&pending::Update {
            id,
            event:
                EntityUpdate {
                    entity,
                    edition: _,
                    archived: _,
                    changed_at: _,
                },
            stage: _,
            legend: _,
        }) = self.pending.next_placement()
        {
            let request = PendingEntry {
                event: id,
                entity,
                phase: Initial,
            };

            if let Some(permit) = permit.take() {
                permit.send(request);
            } else {
                match self.tx.try_send(request) {
                    Ok(()) => {}
                    Err(mpsc::error::TrySendError::Full(_)) => break,
                    Err(mpsc::error::TrySendError::Closed(_)) => return ControlFlow::Break(()),
                }
            }

            self.pending.submitted(ArchivedEntityId::from(entity), id);
        }

        ControlFlow::Continue(())
    }

    fn apply_ready(&mut self) -> bool {
        let mut changed = false;

        self.pending.updates.retain(|&entity, update| {
            let Some(legend) = &update.legend else {
                return true;
            };

            let outcome = match update.stage {
                Stage::Node(Placement::Ready(position)) => {
                    self.delta.update_node(entity, legend.clone(), position)
                }
                Stage::Edge {
                    source: Some(source),
                    target: Some(target),
                } => {
                    let (Some(source), Some(target)) =
                        (self.delta.node_row(source), self.delta.node_row(target))
                    else {
                        return true;
                    };
                    self.delta
                        .update_edge(entity, legend.clone(), Some([source, target]))
                }
                _ => return true,
            };

            if let Some(applied) = outcome {
                changed |= applied;
                false
            } else {
                tracing::warn!(?entity, "No entity row remains for the update");
                true
            }
        });

        changed
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

        changed |= self.apply_ready();
        Ok(changed)
    }
}
