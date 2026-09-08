use hash_graph_postgres_store::store::{EntityEvent, EntityUpdate};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::{collections::FastHashMap, id::Id as _};

use super::EventId;
use crate::{dataset::auxiliary::OwnedLegend, math::Vec2, postgres::id::ArchivedEntityId};

#[cfg(test)]
mod tests;

pub(super) enum Placement {
    Waiting,
    Running,
    Ready(Vec2),
}

pub(super) enum Stage {
    Classify,
    Node(Placement),
    Edge {
        source: Option<ArchivedEntityId>,
        target: Option<ArchivedEntityId>,
    },
}

pub(super) struct Update {
    pub id: EventId,
    pub event: EntityUpdate,
    pub stage: Stage,
    pub legend: Option<OwnedLegend>,
}

impl Update {
    pub(super) const fn needs_legend(&self) -> bool {
        self.legend.is_none()
            && matches!(
                self.stage,
                Stage::Node(Placement::Ready(_)) | Stage::Edge { .. }
            )
    }
}

/// An immediate entity-visibility decision.
pub(super) enum DeltaAction {
    /// An ignored event or an update awaiting later application.
    None,
    Withdraw(ArchivedEntityId),
}

/// Latest event versions and at most one placement request per entity.
///
/// A newer event replaces unfinished work. Its placement waits until the preceding request
/// completes, even after a withdrawal. Completed and failed versions remain recorded for overlap
/// deduplication until the generation retires.
pub(super) struct Pending {
    counter: EventId,
    versions: FastHashMap<ArchivedEntityId, Timestamp<TransactionTime>>,
    placements: FastHashMap<ArchivedEntityId, EventId>,
    pub updates: FastHashMap<ArchivedEntityId, Update>,
}

impl Pending {
    pub(super) fn identity_and_time(
        event: &EntityEvent,
    ) -> (ArchivedEntityId, Timestamp<TransactionTime>) {
        match event {
            EntityEvent::Updated(update) => {
                (ArchivedEntityId::from(update.entity), update.changed_at)
            }
            EntityEvent::Ended(end) => (ArchivedEntityId::from(end.entity), end.ended_at),
            EntityEvent::Deleted(deletion) => (
                ArchivedEntityId::from(deletion.entity),
                deletion.provenance.deleted_at_transaction_time,
            ),
        }
    }

    /// Coalesces a newer event and selects its immediate delta action.
    ///
    /// Equal or older timestamps leave both pending work and its placement request unchanged.
    ///
    /// # Panics
    ///
    /// Panics when the event ID counter overflows.
    pub(super) fn observe(&mut self, event: EntityEvent) -> DeltaAction {
        let (entity, time) = Self::identity_and_time(&event);
        if self.versions.get(&entity).is_some_and(|&held| held >= time) {
            return DeltaAction::None;
        }

        match event {
            EntityEvent::Updated(event) if !event.archived => {
                let id = self.counter;
                self.counter.increment_by(1);
                self.versions.insert(entity, time);
                self.updates.insert(
                    entity,
                    Update {
                        id,
                        event,
                        stage: Stage::Classify,
                        legend: None,
                    },
                );

                DeltaAction::None
            }
            _ => {
                self.versions.insert(entity, time);
                self.updates.remove(&entity);
                DeltaAction::Withdraw(entity)
            }
        }
    }

    pub(super) fn next_placement(&self) -> Option<&Update> {
        self.updates.iter().find_map(|(entity, update)| {
            (matches!(update.stage, Stage::Node(Placement::Waiting))
                && !self.placements.contains_key(entity))
            .then_some(update)
        })
    }

    pub(super) fn submitted(&mut self, entity: ArchivedEntityId, id: EventId) {
        let Some(update) = self
            .updates
            .get_mut(&entity)
            .filter(|update| update.id == id)
        else {
            return;
        };

        self.placements.insert(entity, id);
        update.stage = Stage::Node(Placement::Running);
    }

    /// Releases the matching request and returns whether its update is still current.
    pub(super) fn complete(&mut self, entity: ArchivedEntityId, id: EventId) -> bool {
        if self.placements.get(&entity) != Some(&id) {
            return false;
        }

        self.placements.remove(&entity);
        self.updates
            .get(&entity)
            .is_some_and(|update| update.id == id)
    }
}

impl Default for Pending {
    fn default() -> Self {
        Self {
            counter: EventId::MIN,
            versions: FastHashMap::default(),
            placements: FastHashMap::default(),
            updates: FastHashMap::default(),
        }
    }
}
