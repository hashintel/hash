//! Versioned per-entity work from feed event through delta application.

use hash_graph_postgres_store::store::{EntityEvent, EntityUpdate};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashbrown::hash_map::IterMut;
use hashql_core::{collections::FastHashMap, id::Id as _};
use type_system::knowledge::entity::id::EntityEditionId;

use super::EventId;
use crate::{
    dataset::auxiliary::OwnedLegend,
    math::{Bounds2, Vec2},
    postgres::{Classification, edition_display::DisplayParts, id::ArchivedEntityId},
    salt::lod::stage::WIRE_FRAME,
    serve::delta::{
        Delta,
        placement::{Completed, Initial, PendingEntry},
        projector::Position,
    },
};

#[cfg(test)]
mod tests;

/// A classified entity's wire-frame position or unresolved edge endpoints.
#[derive(Debug, Clone, Copy)]
enum Geometry {
    Node(Vec2),
    Edge(Option<[ArchivedEntityId; 2]>),
}

/// One entity update's progress from classification to capture.
#[derive(Debug)]
enum Stage {
    Classify,
    Place,
    Placing,
    Normalize(Position),
    Capture(Geometry),
    Ready {
        geometry: Geometry,
        legend: OwnedLegend,
    },
}

/// The newest coalesced update for one entity, with its staged progress.
struct Update {
    id: EventId,
    event: EntityUpdate,
    stage: Stage,
}

/// A queued placement held until submission succeeds.
pub(super) struct Placement<'pending> {
    entity: ArchivedEntityId,
    update: &'pending mut Update,
    placements: &'pending mut FastHashMap<ArchivedEntityId, EventId>,
}

impl Placement<'_> {
    /// Builds the placement request for this entity's newest coalesced event.
    pub(super) const fn request(&self) -> PendingEntry<Initial> {
        PendingEntry {
            event: self.update.id,
            entity: self.update.event.entity,
            phase: Initial,
        }
    }

    /// Marks this entity's placement request as outstanding.
    pub(super) fn submitted(self) {
        self.placements.insert(self.entity, self.update.id);
        self.update.stage = Stage::Placing;
    }
}

/// Entities awaiting a placement request, excluding those already outstanding.
pub(super) struct Placements<'pending> {
    updates: IterMut<'pending, ArchivedEntityId, Update>,
    outstanding: &'pending mut FastHashMap<ArchivedEntityId, EventId>,
}

impl Placements<'_> {
    /// Returns the next entity awaiting a placement request, marking none as submitted yet.
    pub(super) fn next_placement(&mut self) -> Option<Placement<'_>> {
        let (&entity, update) = self.updates.find(|(entity, update)| {
            matches!(update.stage, Stage::Place) && !self.outstanding.contains_key(*entity)
        })?;
        Some(Placement {
            entity,
            update,
            placements: self.outstanding,
        })
    }
}

/// An immediate entity-visibility decision.
#[derive(Debug)]
pub(super) enum DeltaAction {
    /// An ignored event or an update awaiting later application.
    None,
    Withdraw(ArchivedEntityId),
}

/// The newest event time and at most one placement request per entity.
///
/// A newer event replaces the entity's retained transaction-time high-water mark and unfinished
/// work. Its placement waits until the preceding request completes, even after a withdrawal.
/// Completion or failure leaves that newest time recorded until this feed task ends. Consequently,
/// an overlapping replay at an equal or older time does not retry a delivered placement failure in
/// the same task. Only a later event version starts new work.
pub(super) struct Pending {
    counter: EventId,
    versions: FastHashMap<ArchivedEntityId, Timestamp<TransactionTime>>,
    placements: FastHashMap<ArchivedEntityId, EventId>,
    updates: FastHashMap<ArchivedEntityId, Update>,
}

impl Pending {
    /// Returns an event's entity identity and the transaction time it takes effect.
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
    /// Panics when a newer, unarchived update must advance the counter past `u32::MAX`, either on a
    /// 64-bit target or on a 32-bit target with overflow checking. A 32-bit target without overflow
    /// checking wraps instead, with the reuse limitations documented on [`EventId`].
    #[expect(
        clippy::needless_pass_by_value,
        reason = "The feed transfers ownership of buffered events to the coalescer"
    )]
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
                    },
                );
                DeltaAction::None
            }
            EntityEvent::Updated(_) | EntityEvent::Ended(_) | EntityEvent::Deleted(_) => {
                self.versions.insert(entity, time);
                self.updates.remove(&entity);
                DeltaAction::Withdraw(entity)
            }
        }
    }

    /// Returns entities awaiting classification.
    pub(super) fn classifications(&self) -> impl Iterator<Item = ArchivedEntityId> {
        self.updates.iter().filter_map(|(&entity, update)| {
            matches!(update.stage, Stage::Classify).then_some(entity)
        })
    }

    /// Advances classified entities to placement or capture, by their resolved kind.
    ///
    /// An entity no longer awaiting classification, or missing from `classifications`, is left
    /// unchanged.
    pub(super) fn classify(
        &mut self,
        delta: &Delta,
        classifications: impl IntoIterator<Item = (ArchivedEntityId, Classification)>,
    ) {
        for (entity, classification) in classifications {
            let Some(update) = self.updates.get_mut(&entity) else {
                continue;
            };
            if !matches!(update.stage, Stage::Classify) {
                continue;
            }

            update.stage = match classification {
                Classification::Node => delta
                    .node_position(entity)
                    .map_or(Stage::Place, |position| {
                        Stage::Capture(Geometry::Node(position))
                    }),
                Classification::Edge { source, target } => {
                    let endpoints = source.zip(target).map(<[_; 2]>::from);
                    if endpoints.is_none() {
                        tracing::warn!(?entity, "The link has an incomplete endpoint pair");
                    }
                    Stage::Capture(Geometry::Edge(endpoints))
                }
            };
        }
    }

    /// Returns whether an entity awaits a placement request that is not yet outstanding.
    pub(super) fn has_placements(&self) -> bool {
        self.updates.iter().any(|(entity, update)| {
            matches!(update.stage, Stage::Place) && !self.placements.contains_key(entity)
        })
    }

    /// Returns a view over entities awaiting a placement request.
    pub(super) fn placements(&mut self) -> Placements<'_> {
        Placements {
            updates: self.updates.iter_mut(),
            outstanding: &mut self.placements,
        }
    }

    /// Matches a placement result against its outstanding request and current update.
    ///
    /// The task drops a reply for a since-removed entity without logging an error or applying it.
    /// Superseded-event rejection relies on distinct [`EventId`] values: counter wrap can make an
    /// old reply match the same entity's newer update. A failed placement discards the pending
    /// update but leaves the entity's newest observed transaction time unchanged for the rest of
    /// this feed task. An overlapping replay at an equal or older time does not retry the failed
    /// placement.
    pub(super) fn receive(
        &mut self,
        PendingEntry {
            event,
            entity,
            phase: Completed(result),
        }: PendingEntry<Completed>,
    ) {
        let entity = ArchivedEntityId::from(entity);
        if self.placements.get(&entity) != Some(&event) {
            return;
        }
        self.placements.remove(&entity);

        let Some(update) = self
            .updates
            .get_mut(&entity)
            .filter(|update| update.id == event)
        else {
            return;
        };

        match result {
            Ok(position) => update.stage = Stage::Normalize(position),
            Err(error) => {
                self.updates.remove(&entity);
                tracing::warn!(?entity, ?error, "Discard the failed placement");
            }
        }
    }

    /// Normalizes placed node positions into the wire frame and advances them to capture.
    ///
    /// `scratch` is cleared on entry and on return.
    pub(super) fn normalize(&mut self, bounds: Bounds2, scratch: &mut Vec<Vec2>) {
        scratch.clear();
        scratch.extend(
            self.updates
                .values()
                .filter_map(|update| match &update.stage {
                    Stage::Normalize(position) => Some(position.get()),
                    Stage::Classify
                    | Stage::Place
                    | Stage::Placing
                    | Stage::Capture(_)
                    | Stage::Ready { .. } => None,
                }),
        );
        if scratch.is_empty() {
            return;
        }

        let positions = bounds.normalize_into(WIRE_FRAME, scratch);
        // Both traversals use the same table order without inserting or removing entries.
        let updates = self
            .updates
            .values_mut()
            .filter(|update| matches!(update.stage, Stage::Normalize(_)));
        for (update, position) in updates.zip(positions) {
            update.stage = Stage::Capture(Geometry::Node(position));
        }
        scratch.clear();
    }

    /// Returns editions awaiting a display read.
    pub(super) fn editions(&self) -> impl Iterator<Item = EntityEditionId> {
        self.updates.values().filter_map(|update| {
            matches!(update.stage, Stage::Capture(_)).then_some(update.event.edition)
        })
    }

    /// Advances entities with a captured display to ready, registering their ontology icon.
    ///
    /// Returns whether `delta` changed. An entity missing from `displays`, or with no display
    /// found, is left unchanged and retried on the next tick.
    ///
    /// # Panics
    ///
    /// Panics under [`Delta::register_ontology`]'s revision condition or [`OwnedLegend::new`]'s
    /// allocation conditions.
    pub(super) fn capture(
        &mut self,
        delta: &mut Delta,
        displays: &mut FastHashMap<EntityEditionId, Option<DisplayParts>>,
    ) -> bool {
        let mut changed = false;
        for update in self.updates.values_mut() {
            let Stage::Capture(geometry) = update.stage else {
                continue;
            };

            let Some(Some(DisplayParts {
                label,
                icon,
                representative,
            })) = displays.remove(&update.event.edition)
            else {
                continue;
            };

            let Some((representative, registered)) = delta.register_ontology(representative, icon)
            else {
                tracing::warn!(entity = ?update.event.entity, "No ontology row remains for the display");
                continue;
            };

            changed |= registered;
            update.stage = Stage::Ready {
                geometry,
                legend: OwnedLegend::new(representative, &label),
            };
        }
        displays.clear();
        changed
    }

    /// Applies every ready update to `delta`, removing entities whose row remains available.
    ///
    /// Returns whether `delta` changed. An entity with no row available, or an edge still missing
    /// an endpoint, is retried on a later call.
    ///
    /// # Panics
    ///
    /// Panics under the revision conditions on [`Delta::update_node`] and [`Delta::update_edge`].
    pub(super) fn apply(&mut self, delta: &mut Delta) -> bool {
        let mut changed = false;

        self.updates.retain(|&entity, update| {
            let Stage::Ready { geometry, legend } = &update.stage else {
                return true;
            };

            let outcome = match *geometry {
                Geometry::Node(position) => delta.update_node(entity, legend.clone(), position),
                Geometry::Edge(Some([source, target])) => {
                    let (Some(source), Some(target)) =
                        (delta.node_row(source), delta.node_row(target))
                    else {
                        return true;
                    };

                    delta.update_edge(entity, legend.clone(), Some([source, target]))
                }
                Geometry::Edge(None) => return true,
            };

            let Some(applied) = outcome else {
                tracing::warn!(?entity, "No entity row remains for the update");
                return true;
            };

            changed |= applied;
            false
        });

        changed
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
